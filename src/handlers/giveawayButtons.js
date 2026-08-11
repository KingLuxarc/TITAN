import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    MessageFlags,
    UserSelectMenuBuilder,
    TextDisplayBuilder,
} from 'discord.js';
import { getGuildGiveaways, saveGiveaway, isGiveawayEnded } from '../utils/giveaways.js';
import { Mutex } from '../utils/mutex.js';
import { selectWinners, isUserRateLimited, recordUserInteraction, createGiveawayEmbed, addGiveawayDivider } from '../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { PermissionFlagsBits } from 'discord.js';

const V2 = MessageFlags.IsComponentsV2;
const EPHEMERAL_V2 = MessageFlags.Ephemeral | V2;

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

function v2Notice(title, body, emoji = 'ℹ️') {
    const container = new ContainerBuilder();
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${emoji} ${title}`));
    addGiveawayDivider(container);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
    return container;
}

async function replyUserError(interaction, message) {
    const container = v2Notice('Giveaway', message, '⚠️');
    if (interaction.replied || interaction.deferred) return interaction.followUp({ components: [container], flags: EPHEMERAL_V2 });
    return interaction.reply({ components: [container], flags: EPHEMERAL_V2 });
}

export function buildParticipantsPanel(giveaway, messageId, kickMode = false) {
    const participants = Array.isArray(giveaway.participants) ? giveaway.participants : [];
    const container = new ContainerBuilder();
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 👥 Giveaway Participants'));
    addGiveawayDivider(container);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**🎁 Giveaway:** ${giveaway.prize}\n**👥 Participants:** ${participants.length}`));
    addGiveawayDivider(container);

    if (participants.length === 0) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent('*No one has entered this giveaway yet.*'));
    } else {
        const visible = participants.slice(0, 50).map((id, index) => `${index + 1}. <@${id}>`).join('\n');
        const more = participants.length > 50 ? `\n\n…and ${participants.length - 50} more participant(s).` : '';
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`${visible}${more}`));
    }

    addGiveawayDivider(container);

    if (kickMode && participants.length > 0) {
        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new UserSelectMenuBuilder()
                    .setCustomId(`giveaway_kick_select:${messageId}`)
                    .setPlaceholder('Select a participant to kick')
                    .setMinValues(1)
                    .setMaxValues(1),
            ),
        );
        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`giveaway_participants:${messageId}`).setLabel('↩️ Back').setStyle(ButtonStyle.Secondary),
            ),
        );
    } else if (participants.length > 0) {
        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`giveaway_kick:${messageId}`).setLabel('🚫 Kick Participant').setStyle(ButtonStyle.Danger),
            ),
        );
    }

    return container;
}

export const giveawayJoinHandler = {
    customId: 'giveaway_join',
    async execute(interaction, client) {
        try {
            if (isUserRateLimited(interaction.user.id, interaction.message.id)) return replyUserError(interaction, 'Please wait a moment before interacting with this giveaway again.');
            await recordUserInteraction(interaction.user.id, interaction.message.id);
            const lockKey = `giveaway:${interaction.message.id}`;
            await Mutex.runExclusive(lockKey, async () => {
                const giveaway = await getGiveaway(client, interaction.guildId, interaction.message.id);
                if (!giveaway) return replyUserError(interaction, 'This giveaway is no longer active.');
                if (isGiveawayEnded(giveaway) || giveaway.ended || giveaway.isEnded || Number(giveaway.endsAt ?? giveaway.endTime) <= Date.now()) return replyUserError(interaction, 'This giveaway has already ended.');
                const participants = Array.isArray(giveaway.participants) ? giveaway.participants : [];
                if (participants.includes(interaction.user.id)) return replyUserError(interaction, 'You have already entered this giveaway! 🎉');
                participants.push(interaction.user.id);
                giveaway.participants = participants;
                await saveGiveaway(client, interaction.guildId, giveaway);
                await interaction.message.edit({ components: [createGiveawayEmbed(giveaway, 'active')] });
                await interaction.reply({ components: [v2Notice('Entry Successful!', `You are now entered. There are **${participants.length}** participant${participants.length === 1 ? '' : 's'}. Good luck!`, '🟢')], flags: EPHEMERAL_V2 });
            });
        } catch (error) {
            logger.error('Error in giveaway join handler:', error);
            await replyUserError(interaction, 'Something went wrong while entering the giveaway. Please try again.');
        }
    },
};

export const giveawayParticipantsHandler = {
    customId: 'giveaway_participants',
    async execute(interaction, client) {
        try {
            const messageId = interaction.message.id;
            const giveaway = await getGiveaway(client, interaction.guildId, messageId);
            if (!giveaway) return replyUserError(interaction, 'This giveaway could not be found.');
            await interaction.reply({ components: [buildParticipantsPanel(giveaway, messageId, false)], flags: EPHEMERAL_V2 });
        } catch (error) {
            await replyUserError(interaction, 'Something went wrong while loading the participants. Please try again.');
        }
    },
};

export const giveawayKickHandler = {
    customId: 'giveaway_kick',
    async execute(interaction, client, args = []) {
        try {
            const messageId = args[0] || interaction.message.id;
            const giveaway = await getGiveaway(client, interaction.guildId, messageId);
            if (!giveaway) return replyUserError(interaction, 'This giveaway could not be found.');
            if (!canManageGiveaway(interaction, giveaway)) return replyUserError(interaction, 'Only the giveaway host or a member with Manage Server can kick participants.');
            if (isGiveawayEnded(giveaway) || giveaway.ended || giveaway.isEnded || Number(giveaway.endsAt ?? giveaway.endTime) <= Date.now()) return replyUserError(interaction, 'This giveaway has already ended.');
            await interaction.update({ components: [buildParticipantsPanel(giveaway, messageId, true)] });
        } catch (error) {
            logger.error('Error in giveaway kick handler:', error);
            await replyUserError(interaction, 'Something went wrong while opening the kick menu. Please try again.');
        }
    },
};

export const giveawayEndHandler = {
    customId: 'giveaway_end',
    async execute(interaction, client) {
        try {
            if (!interaction.inGuild()) return replyUserError(interaction, 'This button can only be used in a server.');
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) return replyUserError(interaction, "You need the 'Manage Server' permission to end a giveaway.");
            const giveaway = await getGiveaway(client, interaction.guildId, interaction.message.id);
            if (!giveaway) return replyUserError(interaction, 'This giveaway is no longer active.');
            if (giveaway.ended || giveaway.isEnded || isGiveawayEnded(giveaway)) return replyUserError(interaction, 'This giveaway has already ended.');
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
            await interaction.reply({ components: [v2Notice('Giveaway Ended', `The giveaway has ended and **${winners.length}** winner${winners.length === 1 ? '' : 's'} ${winners.length === 1 ? 'was' : 'were'} selected.`, '🏁')], flags: EPHEMERAL_V2 });
        } catch (error) {
            logger.error('Error in giveaway end handler:', error);
            await replyUserError(interaction, 'Something went wrong while ending the giveaway. Please try again.');
        }
    },
};

export const giveawayRerollHandler = {
    customId: 'giveaway_reroll',
    async execute(interaction, client) {
        try {
            if (!interaction.inGuild()) return replyUserError(interaction, 'This button can only be used in a server.');
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) return replyUserError(interaction, "You need the 'Manage Server' permission to reroll a giveaway.");
            const giveaway = await getGiveaway(client, interaction.guildId, interaction.message.id);
            if (!giveaway) return replyUserError(interaction, 'This giveaway could not be found.');
            if (!giveaway.ended && !giveaway.isEnded) return replyUserError(interaction, 'This giveaway has not ended yet.');
            const participants = giveaway.participants || [];
            if (participants.length === 0) return replyUserError(interaction, 'There are no entries to reroll from.');
            const newWinners = selectWinners(participants, giveaway.winnerCount);
            giveaway.winnerIds = newWinners;
            giveaway.rerolledAt = new Date().toISOString();
            giveaway.rerolledBy = interaction.user.id;
            await saveGiveaway(client, interaction.guildId, giveaway);
            await interaction.message.edit({ components: [createGiveawayEmbed(giveaway, 'reroll', newWinners)] });
            await interaction.reply({ components: [v2Notice('Giveaway Rerolled', 'New winner(s) have been selected and the giveaway panel has been updated.', '🎲')], flags: EPHEMERAL_V2 });
        } catch (error) {
            logger.error('Error in giveaway reroll handler:', error);
            await replyUserError(interaction, 'Something went wrong while rerolling the giveaway. Please try again.');
        }
    },
};

export const giveawayViewHandler = {
    customId: 'giveaway_view',
    async execute(interaction, client) {
        try {
            const giveaway = await getGiveaway(client, interaction.guildId, interaction.message.id);
            if (!giveaway) return replyUserError(interaction, 'This giveaway could not be found.');
            if (!giveaway.ended && !giveaway.isEnded && !isGiveawayEnded(giveaway)) return replyUserError(interaction, 'This giveaway has not ended yet, so winners are not available.');
            const winnerIds = Array.isArray(giveaway.winnerIds) ? giveaway.winnerIds : [];
            const winnerText = winnerIds.length > 0 ? winnerIds.map((id) => `<@${id}>`).join(', ') : 'No valid winners were selected for this giveaway.';
            await interaction.reply({ components: [v2Notice(`Winners for ${giveaway.prize || 'this giveaway'}`, winnerText, '🏆')], flags: EPHEMERAL_V2 });
        } catch (error) {
            logger.error('Error in giveaway view handler:', error);
            await replyUserError(interaction, 'Something went wrong while loading the winners. Please try again.');
        }
    },
};
