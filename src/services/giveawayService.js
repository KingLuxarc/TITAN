import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder } from 'discord.js';
import { logger } from '../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../utils/errorHandler.js';
import { getEndedGiveaways, markGiveawayEnded } from '../utils/database.js';
import { checkRateLimit, getRateLimitStatus } from './rateLimiter.js';
import { logEvent, EVENT_TYPES } from './loggingService.js';

const GIVEAWAY_INTERACTION_COOLDOWN = 1000;
function getGiveawayInteractionKey(userId, giveawayId) { return `giveaway:${userId}:${giveawayId}`; }
export function addGiveawayDivider(container) { return container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)); }
export function parseDuration(durationString) { if (!durationString || typeof durationString !== 'string') throw new TitanBotError('Invalid duration format provided', ErrorTypes.VALIDATION, 'Please provide a valid duration (e.g., 1h, 30m, 5d, 10s).'); const match = durationString.trim().match(/^(\d+)([hmds])$/i); if (!match) throw new TitanBotError('Invalid duration format', ErrorTypes.VALIDATION, 'Invalid duration format. Use 1h, 30m, 5d, or 10s.'); const amount = Number(match[1]); const ms = amount * ({ s: 1000, m: 60000, h: 3600000, d: 86400000 })[match[2].toLowerCase()]; if (amount <= 0 || amount > 999 || ms > 30 * 86400000 || ms < 10000) throw new TitanBotError('Duration out of range', ErrorTypes.VALIDATION, 'Duration must be between 10 seconds and 30 days.'); return ms; }
export function validatePrize(prize) { if (!prize || typeof prize !== 'string') throw new TitanBotError('Prize must be a non-empty string', ErrorTypes.VALIDATION, 'Please provide a valid giveaway name.'); const trimmed = prize.trim(); if (!trimmed || trimmed.length > 256) throw new TitanBotError('Giveaway name length out of range', ErrorTypes.VALIDATION, 'The giveaway name must be between 1 and 256 characters.'); return trimmed; }
export function validateWinnerCount(winnerCount) { if (!Number.isInteger(winnerCount) || winnerCount < 1 || winnerCount > 10) throw new TitanBotError('Invalid winner count', ErrorTypes.VALIDATION, 'Winner count must be between 1 and 10.'); }

export function createGiveawayEmbed(giveaway, status, winners = []) {
  const ended = status === 'ended' || status === 'reroll';
  const description = giveaway.description?.trim();
  const endTime = Number(giveaway.endsAt ?? giveaway.endTime);
  const entryCount = Array.isArray(giveaway.participants) ? giveaway.participants.length : 0;
  const selectedWinners = winners.length ? winners : (Array.isArray(giveaway.winnerIds) ? giveaway.winnerIds : []);
  const container = new ContainerBuilder();
  if (ended) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🏆 Winners Selected 🏆'));
    addGiveawayDivider(container);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**🎁 Prize:** ${giveaway.prize || 'Unknown Prize'}`));
    if (description) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**📝 Description:** ${description}`));
    addGiveawayDivider(container);
    const endedAt = giveaway.endedAt ? Date.parse(giveaway.endedAt) : Date.now();
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**⏰ Ended:** <t:${Math.floor(endedAt / 1000)}:R>`));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**👥 Entries:** ${entryCount} Participant${entryCount === 1 ? '' : 's'}`));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**👑 Host:** ${giveaway.hostId ? `<@${giveaway.hostId}>` : 'None'}`));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**🎯 Winners:** ${giveaway.winnerCount ?? 1}`));
    addGiveawayDivider(container);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**🎉 Giveaway Winners:** ${selectedWinners.length ? selectedWinners.map((id) => `<@${id}>`).join(', ') : 'No valid entries'}`));
    container.addActionRowComponents(createGiveawayButtons(true, giveaway.messageId));
    return container;
  }
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${giveaway.prize}`));
  if (description) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(description));
  addGiveawayDivider(container);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent([
    giveaway.hostId ? `**👑 Host:** <@${giveaway.hostId}>` : null,
    `**🏆 Winners:** ${giveaway.winnerCount ?? 1}`,
    `**👥 Entries:** ${entryCount}`,
  ].filter(Boolean).join('\n')));
  addGiveawayDivider(container);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(Number.isFinite(endTime) && endTime > 0 ? `**⏰ Ends:** <t:${Math.floor(endTime / 1000)}:R>` : '**⏰ Ends:** Unknown'));
  container.addActionRowComponents(createGiveawayButtons(false, giveaway.messageId));
  return container;
}
export function createGiveawayButtons(ended = false, messageId = null) {
  const row = new ActionRowBuilder();
  if (ended) row.addComponents(new ButtonBuilder().setCustomId(`giveaway_reroll:${messageId || ''}`).setLabel('🎲 Reroll').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(`giveaway_view:${messageId || ''}`).setLabel('👁️ View Winners').setStyle(ButtonStyle.Secondary));
  else row.addComponents(new ButtonBuilder().setCustomId(`giveaway_join:${messageId || ''}`).setLabel('🎉 Join').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`giveaway_participants:${messageId || ''}:0`).setLabel('👥 View Participants').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(`giveaway_end:${messageId || ''}`).setLabel('🛑 End').setStyle(ButtonStyle.Secondary));
  return row;
}
export function selectWinners(participants, winnerCount) { if (!Array.isArray(participants) || !participants.length) return []; const unique = [...new Set(participants)]; if (!Number.isInteger(winnerCount) || winnerCount < 1) throw new TitanBotError('Invalid winner count', ErrorTypes.VALIDATION, 'Winner count must be at least 1.'); const shuffled = [...unique]; for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; } return shuffled.slice(0, Math.min(winnerCount, unique.length)); }
export function isUserRateLimited(userId, giveawayId) { const status = getRateLimitStatus(getGiveawayInteractionKey(userId, giveawayId), GIVEAWAY_INTERACTION_COOLDOWN); return status.attempts >= 1 && status.remaining > 0; }
export async function recordUserInteraction(userId, giveawayId) { await checkRateLimit(getGiveawayInteractionKey(userId, giveawayId), 1, GIVEAWAY_INTERACTION_COOLDOWN); }
export async function endGiveaway(client, giveaway, guildId, endedBy) { if (!giveaway) throw new TitanBotError('Giveaway missing', ErrorTypes.VALIDATION, 'Cannot end a non-existent giveaway.'); if (giveaway.ended || giveaway.isEnded) throw new TitanBotError('Giveaway already ended', ErrorTypes.VALIDATION, 'This giveaway has already ended.'); const participants = giveaway.participants || []; const winners = selectWinners(participants, giveaway.winnerCount || 1); return { success: true, giveaway: { ...giveaway, ended: true, isEnded: true, winnerIds: winners, endedAt: new Date().toISOString(), endedBy, participantCount: participants.length }, winners, participantCount: participants.length }; }
export async function checkGiveaways(client) { try { if (!client.db) return; const endedGiveaways = await getEndedGiveaways(client); for (const record of endedGiveaways) { try { const { id: giveawayId, guild_id: guildId, message_id: messageId, data: giveawayData } = record; const giveaway = typeof giveawayData === 'string' ? JSON.parse(giveawayData) : giveawayData; const guild = client.guilds.cache.get(guildId); if (!guild) continue; const channel = await guild.channels.fetch(giveaway.channelId).catch(() => null); if (!channel) continue; const message = await channel.messages.fetch(messageId).catch(() => null); if (!message) continue; const participants = Array.isArray(giveaway.participants) ? giveaway.participants : []; const winners = selectWinners(participants, giveaway.winnerCount || 1); giveaway.ended = true; giveaway.isEnded = true; giveaway.winnerIds = winners; giveaway.endedAt = new Date().toISOString(); await message.edit({ components: [createGiveawayEmbed(giveaway, 'ended', winners)] }); await markGiveawayEnded(client, giveawayId, giveaway); try { await logEvent({ client, guildId, eventType: EVENT_TYPES.GIVEAWAY_WINNER, data: { description: `Giveaway ended with ${winners.length} winner(s)`, channelId: channel.id } }); } catch {} } catch (error) { logger.error('Error processing giveaway:', error); } } } catch (error) { logger.error('Error checking giveaways:', error); } }
