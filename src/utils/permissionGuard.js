// permissionGuard.js
import { PermissionFlagsBits } from 'discord.js';
import { logger } from './logger.js';
import { replyUserError, ErrorTypes } from './errorHandler.js';

export function getCommandDefaultPermissions(commandData) { const json = commandData?.toJSON?.() ?? commandData; const value = json?.default_member_permissions; if (value == null || value === '0') return null; return BigInt(value); }
function normalizeRoleId(role) { if (!role) return null; if (typeof role === 'string') return role; if (typeof role === 'object' && role.id) return role.id; return null; }
function isModerationCategory(category) { return category?.toLowerCase?.() === 'moderation'; }
export function memberHasConfiguredModeratorRole(member, guildConfig) { if (!member || !guildConfig) return false; const modRoleId = normalizeRoleId(guildConfig.modRole); return Boolean(modRoleId && member.roles.cache.has(modRoleId)); }

// Admin-command access is intentionally separate from normal Discord permissions:
// server owners/administrators always have access; otherwise a role explicitly
// selected in /permissions is required. This applies to the whole Moderation category.
export function memberHasModerationCommandAccess(member, guildConfig) {
  if (!member) return false;
  if (member.guild?.ownerId === member.id) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const roles = Array.isArray(guildConfig?.botAccessRoles) ? guildConfig.botAccessRoles : [];
  return roles.length > 0 && roles.some((roleId) => member.roles.cache.has(roleId));
}

export function memberMeetsCommandPermissions(member, permissionBitfield, options = {}) {
  if (!member) return false;
  const { guildConfig = null, commandCategory = null } = options;
  if (isModerationCategory(commandCategory)) return memberHasModerationCommandAccess(member, guildConfig);
  if (permissionBitfield == null) return true;
  if (member.guild?.ownerId === member.id) return true;
  return member.permissions.has(permissionBitfield);
}

export async function checkModerationPermissions(interaction, guildConfig, requiredPermissions, errorMessage = 'You do not have permission to use this admin command.') {
  if (memberHasModerationCommandAccess(interaction.member, guildConfig)) return true;
  await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: errorMessage, context: { source: 'permissionGuard.checkModerationPermissions' } });
  logger.warn('[PERMISSION_DENIED] Moderation command blocked', { userId: interaction.user?.id, guildId: interaction.guildId, command: interaction.commandName });
  return false;
}

export async function enforceDefaultCommandPermissions(interaction, command, context = {}) {
  const commandCategory = command?.category ?? null;
  if (isModerationCategory(commandCategory)) {
    if (memberHasModerationCommandAccess(interaction.member, context.guildConfig ?? null)) return true;
    await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You do not have an admin/moderation role configured for Luxe. Ask a server administrator to add your role with `/permissions`.', context: { source: context.source ?? 'permissionGuard.enforceDefaultCommandPermissions', commandName: interaction.commandName } });
    return false;
  }

  const requiredPermissions = getCommandDefaultPermissions(command?.data);
  if (requiredPermissions == null) return true;
  const member = interaction.member;
  if (memberMeetsCommandPermissions(member, requiredPermissions, { guildConfig: context.guildConfig ?? null, commandCategory })) return true;
  const commandName = command?.data?.name ?? interaction.commandName ?? 'command';
  await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You do not have permission to use this command.', context: { source: context.source ?? 'permissionGuard.enforceDefaultCommandPermissions', commandName, requiredPermissions: requiredPermissions.toString() } });
  return false;
}

export function hasBotAccess(member, guildConfig) { if (!member) return false; if (member.guild?.ownerId === member.id) return true; if (member.permissions.has(PermissionFlagsBits.Administrator)) return true; const roles = Array.isArray(guildConfig?.botAccessRoles) ? guildConfig.botAccessRoles : []; if (roles.length === 0) return true; return roles.some((roleId) => member.roles.cache.has(roleId)); }
export async function enforceBotAccess(interaction, guildConfig) { if (!interaction.inGuild?.() || hasBotAccess(interaction.member, guildConfig)) return true; await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You do not have a role that is allowed to use Luxe. Ask a server administrator to add your role with `/permissions`.' }); return false; }
export function isAdmin(member) { return Boolean(member?.permissions.has(PermissionFlagsBits.Administrator)); }
export function isModerator(member, guildConfig = null) { if (!member) return false; if (memberHasConfiguredModeratorRole(member, guildConfig)) return true; return member.permissions.has([PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild]); }
export function hasPermission(member, permissions) { return Boolean(member?.permissions.has(permissions)); }
export function botHasPermission(channel, permissions) { if (!channel?.guild) return false; const botMember = channel.guild.members.me; return Boolean(botMember && channel.permissionsFor(botMember).has(permissions)); }
export async function checkUserPermissions(interaction, requiredPermissions, errorMessage = 'You do not have permission to use this command.') { if (!interaction.member.permissions.has(requiredPermissions)) { await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: errorMessage, context: { source: 'permissionGuard.checkUserPermissions' } }); logger.warn(`[PERMISSION_DENIED] User ${interaction.member.id} attempted command ${interaction.commandName} in guild ${interaction.guildId}`); return false; } return true; }
export async function checkBotPermissions(interaction, requiredPermissions, channel = null) { const targetChannel = channel || interaction.channel; if (!targetChannel?.guild) { await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Could not determine channel.' }); return false; } const botMember = targetChannel.guild.members.me; if (!botMember) { await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Could not find bot member in this server.' }); return false; } const permissions = targetChannel.permissionsFor(botMember); const permArray = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions]; const missingPerms = permArray.filter((perm) => !permissions.has(perm)); if (missingPerms.length) { await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: `I need the following permissions in ${targetChannel}: ${missingPerms.join(', ')}` }); return false; } return true; }
function hashUserId(userId) { let hash = 0; for (let i = 0; i < userId.length; i++) { const char = userId.charCodeAt(i); hash = ((hash << 5) - hash) + char; hash &= hash; } return Math.abs(hash).toString(16).substring(0, 8); }
export function auditPermissionCheck(userId, action, allowed, reason = null) { const userHash = hashUserId(userId); if (allowed) logger.debug('[PERMISSION_AUDIT] Permission granted', { action, userHash }); else logger.warn('[PERMISSION_AUDIT] Permission denied', { action, userHash, reason: reason || 'insufficient_permissions' }); }
export default { isAdmin, isModerator, hasPermission, botHasPermission, hasBotAccess, enforceBotAccess, getCommandDefaultPermissions, memberHasConfiguredModeratorRole, memberHasModerationCommandAccess, memberMeetsCommandPermissions, checkModerationPermissions, enforceDefaultCommandPermissions, checkUserPermissions, checkBotPermissions, auditPermissionCheck };
