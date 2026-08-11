// giveawayService.js

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { logger } from '../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../utils/errorHandler.js';
import { getEndedGiveaways, markGiveawayEnded } from '../utils/database.js';
import { checkRateLimit, getRateLimitStatus } from '../utils/rateLimiter.js';
import { logEvent, EVENT_TYPES } from './loggingService.js';

const GIVEAWAY_INTERACTION_COOLDOWN = 1000;
const GIVEAWAY_DIVIDER = '━━━━━━━━━━━━━━━━━━━━━━━━';

function getGiveawayInteractionKey(userId, giveawayId) {
    return `giveaway:${userId}:${giveawayId}`;
}

export function parseDuration(durationString) {
    if (!durationString || typeof durationString !== 'string') throw new TitanBotError('Invalid duration format provided', ErrorTypes.VALIDATION, 'Please provide a valid duration (e.g., 1h, 30m, 5d, 10s).', { durationString });
    const match = durationString.trim().match(/^(\d+)([hmds])$/i);
    if (!match) throw new TitanBotError(`Invalid duration format: ${durationString}`, ErrorTypes.VALIDATION, 'Invalid duration format. Use: 1h, 30m, 5d, 10s (min: 10s, max: 30d)', { input: durationString });
    const amount = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    if (amount <= 0 || amount > 999) throw new TitanBotError(`Duration amount out of range: ${amount}`, ErrorTypes.VALIDATION, 'Duration amount must be between 1 and 999.', { amount, unit });
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    const ms = amount * multipliers[unit];
    if (ms > 30 * 86400000) throw new TitanBotError('Duration exceeds maximum', ErrorTypes.VALIDATION, 'Maximum duration is 30 days.');
    if (ms < 10000) throw new TitanBotError('Duration below minimum', ErrorTypes.VALIDATION, 'Minimum duration is 10 seconds.');
    return ms;
}

export function validatePrize(prize) {
    if (!prize || typeof prize !== 'string') throw new TitanBotError('Prize must be a non-empty string', ErrorTypes.VALIDATION, 'Please provide a valid giveaway name.');
    const trimmed = prize.trim();
    if (trimmed.length === 0 || trimmed.length > 256) throw new TitanBotError('Giveaway name length out of range', ErrorTypes.VALIDATION, 'The giveaway name must be between 1 and 256 characters.');
    return trimmed;
}

export function validateWinnerCount(winnerCount) {
    if (!Number.isInteger(winnerCount) || winnerCount < 1 || winnerCount > 10) throw new TitanBotError(`Invalid winner count: ${winnerCount}`, ErrorTypes.VALIDATION, 'Winner count must be between 1 and 10.', { winnerCount });
}

export function createGiveawayEmbed(giveaway, status, winners = []) {
    try {
        const isEnded = status === 'ended' || status === 'reroll';
        const description = giveaway.description?.trim();
        const endTime = Number(giveaway.endsAt ?? giveaway.endTime);
        const lines = [];

        if (description) lines.push(description, '');
        lines.push(GIVEAWAY_DIVIDER, '');

        if (giveaway.hostId) lines.push(`**Host:** <@${giveaway.hostId}>`);
        lines.push(`**Winners:** ${giveaway.winnerCount ?? 1}`);
        lines.push(`**Entries:** ${Array.isArray(giveaway.participants) ? giveaway.participants.length : 0}`);
        lines.push('', GIVEAWAY_DIVIDER, '');

        if (isEnded) {
            const winnerDisplay = winners.length > 0 ? winners.map((id) => `<@${id}>`).join(', ') : 'No valid entries';
            lines.push(`**Winners:** ${winnerDisplay}`);
        } else if (Number.isFinite(endTime) && endTime > 0) {
            lines.push(`**Ends:** <t:${Math.floor(endTime / 1000)}:R>`);
        } else {
            lines.push('**Ends:** Unknown');
        }

        // Discord embeds do not support Markdown horizontal rules in descriptions.
        // Use a visual divider glyph for a true line instead of literal "---" text.
        return new EmbedBuilder()
            .setTitle(`**${giveaway.prize}**`)
            .setDescription(lines.join('\n'));
    } catch (error) {
        logger.error('Error creating giveaway embed:', error);
        throw new TitanBotError('Failed to create giveaway embed', ErrorTypes.UNKNOWN, 'An internal error occurred while formatting the giveaway.', { error: error.message });
    }
}

export function createGiveawayButtons(ended = false) {
    try {
        const row = new ActionRowBuilder();
        if (ended) {
            row.addComponents(
                new ButtonBuilder().setCustomId('giveaway_reroll').setLabel('🎲 Reroll').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('giveaway_view').setLabel('👁️ View Winners').setStyle(ButtonStyle.Secondary),
            );
        } else {
            row.addComponents(
                new ButtonBuilder().setCustomId('giveaway_join').setLabel('🎉 Join').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('giveaway_end').setLabel('🛑 End').setStyle(ButtonStyle.Secondary),
            );
        }
        return row;
    } catch (error) {
        logger.error('Error creating giveaway buttons:', error);
        throw new TitanBotError('Failed to create giveaway buttons', ErrorTypes.UNKNOWN, 'An internal error occurred while creating giveaway buttons.', { error: error.message });
    }
}

export function selectWinners(participants, winnerCount) {
    if (!Array.isArray(participants) || participants.length === 0) return [];
    const uniqueParticipants = [...new Set(participants)];
    if (!Number.isInteger(winnerCount) || winnerCount < 1) throw new TitanBotError('Invalid winner count for selection', ErrorTypes.VALIDATION, 'Winner count must be at least 1.', { winnerCount });
    const shuffled = [...uniqueParticipants];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, Math.min(winnerCount, uniqueParticipants.length));
}

export function isUserRateLimited(userId, giveawayId) {
    const status = getRateLimitStatus(getGiveawayInteractionKey(userId, giveawayId), GIVEAWAY_INTERACTION_COOLDOWN);
    return status.attempts >= 1 && status.remaining > 0;
}

export async function recordUserInteraction(userId, giveawayId) {
    await checkRateLimit(getGiveawayInteractionKey(userId, giveawayId), 1, GIVEAWAY_INTERACTION_COOLDOWN);
}

export async function endGiveaway(client, giveaway, guildId, endedBy) {
    if (!giveaway) throw new TitanBotError('Giveaway object is null or undefined', ErrorTypes.VALIDATION, 'Cannot end a non-existent giveaway.');
    if (giveaway.ended === true || giveaway.isEnded === true) throw new TitanBotError('Giveaway already ended', ErrorTypes.VALIDATION, 'This giveaway has already ended.');
    const participants = giveaway.participants || [];
    const winners = selectWinners(participants, giveaway.winnerCount || 1);
    return { success: true, giveaway: { ...giveaway, ended: true, isEnded: true, winnerIds: winners, endedAt: new Date().toISOString(), endedBy, participantCount: participants.length }, winners, participantCount: participants.length };
}

export async function checkGiveaways(client) {
    try {
        if (!client.db) return;
        const endedGiveaways = await getEndedGiveaways(client);
        for (const giveawayRecord of endedGiveaways) {
            try {
                const { id: giveawayId, guild_id: guildId, message_id: messageId, data: giveawayData } = giveawayRecord;
                const giveaway = typeof giveawayData === 'string' ? JSON.parse(giveawayData) : giveawayData;
                const guild = client.guilds.cache.get(guildId);
                if (!guild) continue;
                const channel = await guild.channels.fetch(giveaway.channelId).catch(() => null);
                if (!channel) continue;
                const message = await channel.messages.fetch(messageId).catch(() => null);
                if (!message) continue;
                const participants = giveaway.participants || [];
                const winners = selectWinners(participants, giveaway.winnerCount || 1);
                await message.edit({ embeds: [createGiveawayEmbed(giveaway, 'ended', winners)], components: [createGiveawayButtons(true)] });
                giveaway.ended = true;
                giveaway.isEnded = true;
                giveaway.winnerIds = winners;
                giveaway.endedAt = new Date().toISOString();
                await markGiveawayEnded(client, giveawayId, giveaway);
                if (winners.length > 0) {
                    const winnerMentions = winners.map((id) => `<@${id}>`).join(', ');
                    await channel.send({ content: `🎉 Congratulations ${winnerMentions}! You won the **${giveaway.prize || 'giveaway'}**! Please contact <@${giveaway.hostId}> to claim your prize.` });
                    try { await logEvent({ client, guildId, eventType: EVENT_TYPES.GIVEAWAY_WINNER, data: { description: `Giveaway ended with ${winners.length} winner(s)`, channelId: channel.id } }); } catch (error) { logger.debug('Error logging giveaway winner:', error); }
                } else {
                    await channel.send({ content: `The giveaway for **${giveaway.prize}** has ended with no valid entries.` });
                }
            } catch (error) { logger.error('Error processing giveaway:', error); }
        }
    } catch (error) { logger.error('Error checking giveaways:', error); }
}
