import { MessageFlags, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } from 'discord.js';
import { successEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';
import { TitanBotError, ErrorTypes, handleInteractionError } from '../utils/errorHandler.js';
import { getGuildGiveaways, saveGiveaway, isGiveawayEnded } from '../utils/giveaways.js';
import { Mutex } from '../utils/mutex.js';
import { selectWinners, isUserRateLimited, recordUserInteraction, createGiveawayEmbed } from '../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';

const COMPONENTS_V2_FLAG = MessageFlags.IsComponentsV2;

async function getGiveaway(client, guildId, messageId) {
    const guildGiveaways = await getGuildGiveaways(client, guildId);
    return guildGiveaways.find((g) => g.messageId === messageId) || null;
}

function canManageGiveaway(interaction, giveaway) {
    return Boolean(
        interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild)
        || (giveaway?.hostId && giveaway.hostId === interaction.user.id),
    );
}

async function replyUserError(interaction, { message }) {
    const embed = new EmbedBuilder().setTitle('Giveaway').setDescription(message);
    if (interaction.replied || interaction.deferred) return interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

export const giveawayJoinHandler = {
    customId: 'giveaway_join',
    async execute(interaction, client) {
        try {
            if (isUserRateLimited(interaction.user.id, interaction.message.id)) {
                return replyUserError(interaction, { message: 'Please wait a moment before interacting with this giveaway again.' });
            }
            await recordUserInteraction(interaction.user.id, interaction.message.id);
            const lockKey = `giveaway:${interaction.message.id}`;
            await Mutex.runExclusive(lockKey, async () => {
                const giveaway = await getGiveaway(client, interaction.guildId, interaction.message.id);
                if (!giveaway) throw new TitanBotError('Giveaway not found', ErrorTypes.VALIDATION, 'This giveaway is no longer active.');
                if (isGiveawayEnded(giveaway) || giveaway.ended || giveaway.isEnded || Number(giveaway.endsAt ?? giveaway.endTime) <= Date.now()) {
                    return replyUserError(interaction, { message: 'This giveaway has already ended.' });
                }
                const participants = Array.isArray(giveaway.participants) ? giveaway.participants : [];
                if (participants.includes(interaction.user.id)) return replyUserError(interaction, { message: 'You have already entered this giveaway! 🎉' });
                participants.push(interaction.user.id);
                giveaway.participants = participants;
                await saveGiveaway(client, interaction.guildId, giveaway);
                await interaction.message.edit({ components: [createGiveawayEmbed(giveaway, 'active')] });
                await interaction.reply({ embeds: [successEmbed('Entry Successful! 🎉', `You are now entered. There are **${participants.length}** participant${participants.length === 1 ? '' : 's'}. Good luck!`)], flags: MessageFlags.Ephemeral });
            });
        } catch (error) {
            logger.error('Error in giveaway join handler:', error);
            await handleInteractionError(interaction, error, { type: 'button', customId: 'giveaway_join', handler: 'giveaway' });
        }
    },
};

export const giveawayParticipantsHandler = {
    customId: 'giveaway_participants',
    async execute(interaction, client, args = []) {
        try {
            const messageId = args[0] || interaction.message.id;
            const giveaway = await getGiveaway(client, interaction.guildId, messageId);
            if (!giveaway) return replyUserError(interaction, { message: 'This giveaway could not be found.' });
            const participants = Array.isArray(giveaway.participants) ? giveaway.participants : [];
            const visible = participants.slice(0, 50).map((id, index) => `${index + 1}. <@${id}>`).join('\n') || '*No one has entered yet.*';
            const more = participants.length > 50 ? `\n\n…and ${participants.length - 50} more participant(s).` : '';
            const embed = new EmbedBuilder()
                .setTitle('Giveaway Participants')
                .setDescription(`**${giveaway.prize}**\n\n${visible}${more}`)
                .setFooter({ text: `${participants.length} participant${participants.length === 1 ? '' : 's'} • This list is private` });
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        } catch (error) {
            await handleInteractionError(interaction, error, { type: 'button', customId: 'giveaway_participants', handler: 'giveaway' });
        }
    },
};

export const giveawayKickHandler = {
    customId: 'giveaway_kick',
    async execute(interaction, client, args = []) {
        try {
            const messageId = args[0] || interaction.message.id;
            const giveaway = await getGiveaway(client, interaction.guildId, messageId);
            if (!giveaway) return replyUserError(interaction, { message: 'This giveaway could not be found.' });
            if (!canManageGiveaway(interaction, giveaway)) return replyUserError(interaction, { message: 'Only the giveaway host or a member with Manage Server can kick participants.' });
            if (isGiveawayEnded(giveaway) || giveaway.ended || giveaway.isEnded) return replyUserError(interaction, { message: 'This giveaway has already ended.' });

            const modal = new ModalBuilder()
                .setCustomId(`giveaway_kick_modal:${messageId}`)
                .setTitle('Kick Giveaway Participant');
            const input = new TextInputBuilder()
                .setCustomId('participant_id')
                .setLabel('Participant User ID')
                .setPlaceholder('Paste the Discord user ID')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMinLength(17)
                .setMaxLength(20);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
        } catch (error) {
            await handleInteractionError(interaction, error, { type: 'button', customId: 'giveaway_kick', handler: 'giveaway' });
        }
    },
};

export const giveawayEndHandler = {
    customId: 'giveaway_end',
    async execute(interaction, client) {
        try {
            if (!interaction.inGuild()) throw new TitanBotError('Button used outside guild', ErrorTypes.VALIDATION, 'This button can only be used in a server.');
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) return replyUserError(interaction, { message: "You need the 'Manage Server' permission to end a giveaway." });
            const giveaway = await getGiveaway(client, interaction.guildId, interaction.message.id);
            if (!giveaway) throw new TitanBotError('Giveaway not found', ErrorTypes.VALIDATION, 'This giveaway is no longer active.');
            if (giveaway.ended || giveaway.isEnded || isGiveawayEnded(giveaway)) throw new TitanBotError('Giveaway already ended', ErrorTypes.VALIDATION, 'This giveaway has already ended.');
            const participants = giveaway.participants || [];
            const winners = selectWinners(participants, giveaway.winnerCount);
            giveaway.ended = true;
            giveaway.isEnded = true;
            giveaway.winnerIds = winners;
            giveaway.endedAt = new Date().toISOString();
            giveaway.endedBy = interaction.user.id;
            await saveGiveaway(client, interaction.guildId, giveaway);
            await interaction.message.edit({ components: [createGiveawayEmbed(giveaway, 'ended', winners)] });
            try { await logEvent({ client, guildId: interaction.guildId, eventType: EVENT_TYPES.GIVEAWAY_WINNER, data: { description: `Giveaway ended with ${winners.length} winner(s)`, channelId: interaction.channelId, userId: interaction.user.id } }); } catch (logError) { logger.debug('Error logging giveaway end event:', logError); }
            await interaction.reply({ embeds: [successEmbed('Giveaway Ended ✅', `The giveaway has ended and ${winners.length} winner(s) have been selected!`)], flags: MessageFlags.Ephemeral });
        } catch (error) {
            logger.error('Error in giveaway end handler:', error);
            await handleInteractionError(interaction, error, { type: 'button', customId: 'giveaway_end', handler: 'giveaway' });
        }
    },
};

export const giveawayRerollHandler = {
    customId: 'giveaway_reroll',
    async execute(interaction, client) {
        try {
            if (!interaction.inGuild()) throw new TitanBotError('Button used outside guild', ErrorTypes.VALIDATION, 'This button can only be used in a server.');
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) return replyUserError(interaction, { message: "You need the 'Manage Server' permission to reroll a giveaway." });
            const giveaway = await getGiveaway(client, interaction.guildId, interaction.message.id);
            if (!giveaway) throw new TitanBotError('Giveaway not found', ErrorTypes.VALIDATION, 'This giveaway is no longer active.');
            if (!giveaway.ended && !giveaway.isEnded) throw new TitanBotError('Giveaway still active', ErrorTypes.VALIDATION, 'This giveaway has not ended yet. Please end it first.');
            const participants = giveaway.participants || [];
            if (participants.length === 0) throw new TitanBotError('No participants to reroll', ErrorTypes.VALIDATION, 'There are no entries to reroll from.');
            const newWinners = selectWinners(participants, giveaway.winnerCount);
            giveaway.winnerIds = newWinners;
            giveaway.rerolledAt = new Date().toISOString();
            giveaway.rerolledBy = interaction.user.id;
            await saveGiveaway(client, interaction.guildId, giveaway);
            await interaction.message.edit({ components: [createGiveawayEmbed(giveaway, 'reroll', newWinners)] });
            await interaction.reply({ embeds: [successEmbed('Giveaway Rerolled ✅', 'New winner(s) have been selected!')], flags: MessageFlags.Ephemeral });
        } catch (error) {
            logger.error('Error in giveaway reroll handler:', error);
            await handleInteractionError(interaction, error, { type: 'button', customId: 'giveaway_reroll', handler: 'giveaway' });
        }
    },
};

export const giveawayViewHandler = {
    customId: 'giveaway_view',
    async execute(interaction, client) {
        try {
            const giveaway = await getGiveaway(client, interaction.guildId, interaction.message.id);
            if (!giveaway) throw new TitanBotError('Giveaway not found', ErrorTypes.VALIDATION, 'This giveaway could not be found.');
            if (!giveaway.ended && !giveaway.isEnded && !isGiveawayEnded(giveaway)) return replyUserError(interaction, { message: 'This giveaway has not ended yet, so winners are not available.' });
            const winnerIds = Array.isArray(giveaway.winnerIds) ? giveaway.winnerIds : [];
            await interaction.reply({ embeds: [successEmbed(`Winners for ${giveaway.prize || 'this giveaway'} 🎉', winnerIds.length > 0 ? winnerIds.map(id => `<@${id}>`).join(', ') : 'No valid winners were selected for this giveaway.')], flags: MessageFlags.Ephemeral });
        } catch (error) {
            logger.error('Error in giveaway view handler:', error);
            await handleInteractionError(interaction, error, { type: 'button', customId: 'giveaway_view', handler: 'giveaway' });
        }
    },
};
