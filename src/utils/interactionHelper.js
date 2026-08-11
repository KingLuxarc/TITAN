// interactionHelper.js

import { logger } from './logger.js';
import { MessageFlags, ContainerBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder } from 'discord.js';
import { handleInteractionError, createError, ErrorTypes } from './errorHandler.js';
import { ResponseCoordinator } from './responseCoordinator.js';

const INTERACTION_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_DEFER_OPTIONS = { flags: MessageFlags.Ephemeral };
const INTERACTION_UNAVAILABLE_CODES = new Set([10062, 40060, 50027]);
const V2 = MessageFlags.IsComponentsV2;

function isInteractionUnavailableError(error) {
    return INTERACTION_UNAVAILABLE_CODES.has(error?.code);
}

function applyAdminVisibility(interaction, options = {}) {
    if (!interaction?._luxeAdminCommand || !options || typeof options !== 'object') return options;
    const result = { ...options };
    const flags = Number(result.flags || 0);
    if (interaction._luxeVisible === true) {
        result.flags = flags & ~MessageFlags.Ephemeral;
        result.ephemeral = false;
    } else {
        result.flags = flags | MessageFlags.Ephemeral;
        result.ephemeral = true;
    }
    return result;
}

function getEmbedData(embed) {
    if (!embed) return null;
    if (typeof embed.toJSON === 'function') return embed.toJSON();
    if (embed.data && typeof embed.data === 'object') return embed.data;
    if (typeof embed === 'object') return embed;
    return null;
}

function convertEmbedToContainer(embed) {
    const data = getEmbedData(embed);
    if (!data) return null;

    const container = new ContainerBuilder();
    const title = typeof data.title === 'string' && data.title.trim() ? data.title.trim() : '';
    const description = typeof data.description === 'string' && data.description.trim() ? data.description.trim() : '';
    const author = typeof data.author?.name === 'string' && data.author.name.trim() ? data.author.name.trim() : '';
    const fields = Array.isArray(data.fields) ? data.fields : [];

    if (author) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`*${author}*`));
    if (title) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}`));
    if (title && (description || fields.length > 0)) {
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    }
    if (description) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(description));

    for (const field of fields) {
        if (!field?.name && !field?.value) continue;
        const name = field.name ? `**${field.name}**\n` : '';
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`${name}${field.value || ''}`));
    }

    if (data.footer?.text) {
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`*${data.footer.text}*`));
    }

    return container;
}

function convertEmbedsToV2(options) {
    if (!options || typeof options !== 'object' || !Array.isArray(options.embeds) || options.embeds.length === 0) {
        return options;
    }
    if (options.flags && (options.flags & V2)) return options;

    const containers = options.embeds.map(convertEmbedToContainer).filter(Boolean);
    if (containers.length === 0) return options;

    const { embeds, ...rest } = options;
    const existingComponents = Array.isArray(rest.components) ? rest.components : [];
    const components = [...containers, ...existingComponents];
    return {
        ...rest,
        components,
        flags: (rest.flags || 0) | V2,
    };
}

function sanitizeEditReplyOptions(options = {}) {
    if (!options || typeof options !== 'object') return options;
    const converted = convertEmbedsToV2(options);
    const { flags, ephemeral, ...rest } = converted;
    if (flags && (flags & V2)) rest.flags = V2;
    return rest;
}

export class InteractionHelper {
    static getCoordinator(interaction) {
        return interaction?._responseCoordinator || null;
    }

    static patchInteractionResponses(interaction) {
        if (!interaction || interaction.__titanResponsePatched) return;

        const originalReply = interaction.reply?.bind(interaction);
        const originalEditReply = interaction.editReply?.bind(interaction);
        const originalFollowUp = interaction.followUp?.bind(interaction);
        const originalDeferReply = interaction.deferReply?.bind(interaction);
        if (!originalReply || !originalEditReply || !originalFollowUp) return;

        interaction.reply = async (options) => {
            const normalized = applyAdminVisibility(interaction, convertEmbedsToV2(options));
            const coordinator = InteractionHelper.getCoordinator(interaction);
            if (coordinator?.isUsageFinalized()) return coordinator.getReplyMessage();
            if (!interaction.deferred && !interaction.replied) {
                if (coordinator && interaction._isPrefixCommand) return coordinator.respond(normalized);
                return await originalReply(normalized);
            }
            if (interaction.deferred && !interaction.replied) {
                if (coordinator && interaction._isPrefixCommand) return coordinator.edit(sanitizeEditReplyOptions(normalized));
                return await originalEditReply(sanitizeEditReplyOptions(normalized));
            }
            if (coordinator && interaction._isPrefixCommand) return coordinator.followUp(normalized);
            return await originalFollowUp(normalized);
        };

        interaction.followUp = async (options) => originalFollowUp(applyAdminVisibility(interaction, convertEmbedsToV2(options)));
        interaction.editReply = async (options) => originalEditReply(sanitizeEditReplyOptions(applyAdminVisibility(interaction, options)));
        if (originalDeferReply) {
            interaction.deferReply = async (options = {}) => {
                if (!interaction._luxeAdminCommand) return originalDeferReply(options);
                return originalDeferReply(interaction._luxeVisible === true ? {} : { ...options, flags: MessageFlags.Ephemeral });
            };
        }
        interaction.__titanResponsePatched = true;
    }

    static isInteractionValid(interaction) {
        if (!interaction || typeof interaction !== 'object') return false;
        if (!interaction.id || typeof interaction.id !== 'string') return false;
        if (!interaction.user || typeof interaction.user !== 'object') return false;
        if (interaction.createdTimestamp && (Date.now() - interaction.createdTimestamp) > INTERACTION_TIMEOUT_MS) return false;
        return true;
    }

    static async ensureReady(interaction, deferOptions = { flags: MessageFlags.Ephemeral }) {
        if (!this.isInteractionValid(interaction)) return false;
        if (interaction.replied || interaction.deferred) return true;
        if (interaction._isPrefixCommand) {
            const coordinator = this.getCoordinator(interaction) || ResponseCoordinator.attach(interaction);
            return coordinator.deferLocal();
        }
        return await this.safeDefer(interaction, deferOptions);
    }

    static async safeDefer(interaction, options = {}) {
        try {
            if (interaction.deferred || interaction.replied) return true;
            const coordinator = this.getCoordinator(interaction);
            if (coordinator?.isUsageFinalized()) return false;
            if (interaction._isPrefixCommand) return coordinator?.deferLocal() ?? false;
            if (!this.isInteractionValid(interaction)) return false;
            if (interaction._luxeAdminCommand) {
                options = interaction._luxeVisible === true ? {} : { ...options, flags: MessageFlags.Ephemeral };
            }
            await interaction.deferReply(options);
            return true;
        } catch (error) {
            if (isInteractionUnavailableError(error)) return false;
            if (error.name === 'InteractionAlreadyReplied' || error.code === 40060) return true;
            logger.error('Failed to defer reply:', error);
            return false;
        }
    }

    static async safeEditReply(interaction, options) {
        try {
            const normalized = sanitizeEditReplyOptions(applyAdminVisibility(interaction, options));
            const coordinator = this.getCoordinator(interaction);
            if (coordinator?.isUsageFinalized()) return false;
            if (!this.isInteractionValid(interaction)) return false;
            if (coordinator && (interaction._isPrefixCommand || coordinator.getReplyMessage())) {
                await coordinator.edit(normalized);
                return true;
            }
            if (!interaction.replied && !interaction.deferred) return await this.safeReply(interaction, normalized);
            await interaction.editReply(normalized);
            return true;
        } catch (error) {
            if (isInteractionUnavailableError(error)) return false;
            if (error.code === 40060) return false;
            if (error.name === 'InteractionNotReplied' || error.message.includes('not been sent or deferred')) return await this.safeReply(interaction, options);
            if (error.code === 10008) {
                try { await interaction.followUp(applyAdminVisibility(interaction, convertEmbedsToV2(options))); return true; } catch { return false; }
            }
            logger.error('Failed to edit reply:', error);
            return false;
        }
    }

    static async safeReply(interaction, options) {
        try {
            const normalized = applyAdminVisibility(interaction, convertEmbedsToV2(options));
            const coordinator = this.getCoordinator(interaction);
            if (coordinator?.isUsageFinalized()) return false;
            if (!this.isInteractionValid(interaction)) return false;
            if (coordinator && (interaction._isPrefixCommand || coordinator.hasResponded())) {
                if (coordinator.hasResponded()) await coordinator.edit(normalized);
                else await coordinator.respond(normalized);
                return true;
            }
            if (interaction.deferred && !interaction.replied) { await interaction.editReply(sanitizeEditReplyOptions(normalized)); return true; }
            if (interaction.replied) { await interaction.followUp(normalized); return true; }
            await interaction.reply(normalized);
            return true;
        } catch (error) {
            if (isInteractionUnavailableError(error) || error.code === 40060) return false;
            logger.error('Failed to reply:', error);
            return false;
        }
    }

    static async safeShowModal(interaction, modal) {
        try {
            if (!this.isInteractionValid(interaction) || interaction.replied || interaction.deferred) return false;
            await interaction.showModal(modal);
            return true;
        } catch (error) {
            if (isInteractionUnavailableError(error)) return false;
            logger.error('Failed to show modal:', error);
            return false;
        }
    }

    static async safeExecute(interaction, commandFunction, errorEmbed, options = {}) {
        const autoDeferDefault = !interaction._isPrefixCommand;
        const { autoDefer = autoDeferDefault, deferOptions = { flags: MessageFlags.Ephemeral } } = options;
        if (!this.isInteractionValid(interaction)) return;
        const coordinator = this.getCoordinator(interaction);
        if (coordinator?.isUsageFinalized()) return;
        if (autoDefer && !interaction.replied && !interaction.deferred) {
            const deferStartTime = Date.now();
            const deferSuccess = await this.safeDefer(interaction, deferOptions);
            if (Date.now() - deferStartTime > 3000) logger.warn(`Interaction ${interaction.id} defer took too long (${Date.now() - deferStartTime}ms)`);
            if (!deferSuccess) return;
        }
        try {
            await commandFunction();
        } catch (error) {
            logger.error('Error executing command:', error);
            if (coordinator?.isUsageFinalized()) return;
            const errorToHandle = typeof errorEmbed === 'string'
                ? createError(error.message || 'Command failed', ErrorTypes.UNKNOWN, errorEmbed, { expected: true })
                : error;
            await handleInteractionError(interaction, errorToHandle, { source: 'interactionHelper.safeExecute' });
        }
    }

    static async universalReply(interaction, options) {
        const normalized = applyAdminVisibility(interaction, convertEmbedsToV2(options));
        const coordinator = this.getCoordinator(interaction);
        if (coordinator?.isUsageFinalized()) return false;
        if (interaction._isPrefixCommand) {
            if (coordinator?.hasResponded()) return await coordinator.edit(sanitizeEditReplyOptions(normalized));
            return await coordinator?.respond(normalized) ?? this.safeReply(interaction, normalized);
        }
        const isReady = await this.ensureReady(interaction, normalized.flags ? { flags: normalized.flags } : {});
        if (!isReady) return false;
        if (interaction.deferred) return await this.safeEditReply(interaction, normalized);
        return await this.safeReply(interaction, normalized);
    }
}

export function withSafeExecuteDecorator(target, propertyName, descriptor) {
    const originalMethod = descriptor.value;
    descriptor.value = async function(interaction, config, client) {
        await InteractionHelper.safeExecute(interaction, () => originalMethod.call(this, interaction, config, client), null, { autoDefer: !interaction._isPrefixCommand });
    };
    return descriptor;
}