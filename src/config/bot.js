import { logger } from '../utils/logger.js';

export const botConfig = {
  presence: { status: 'online', activities: [{ name: 'Luxe', type: 0 }] },
  commands: {
    owners: process.env.OWNER_IDS?.split(',').map((id) => id.trim()).filter(Boolean) || [],
    defaultCooldown: 3,
    deleteCommands: false,
    testGuildId: process.env.TEST_GUILD_ID,
  },
  applications: {
    defaultQuestions: [
      { question: 'What is your name?', required: true },
      { question: 'How old are you?', required: true },
      { question: 'Why do you want to join?', required: true },
    ],
    statusColors: { pending: '#FFA500', approved: '#00FF00', denied: '#FF0000' },
    applicationCooldown: 24,
    deleteDeniedAfter: 7,
    deleteApprovedAfter: 30,
    managerRoles: [],
  },
  embeds: {
    colors: {},
    footer: { text: 'Luxe', icon: null },
    thumbnail: null,
    author: { name: null, icon: null, url: null },
  },
  shop: {},
  tickets: {
    defaultCategory: null,
    supportRoles: [],
    priorities: {
      none: { emoji: '⚪', color: '#95A5A6', label: 'None' },
      low: { emoji: '🟢', color: '#2ECC71', label: 'Low' },
      medium: { emoji: '🟡', color: '#F1C40F', label: 'Medium' },
      high: { emoji: '🔴', color: '#E74C3C', label: 'High' },
      urgent: { emoji: '🚨', color: '#E91E63', label: 'Urgent' },
    },
    defaultPriority: 'none', archiveCategory: null, logChannel: null,
  },
  giveaways: {
    defaultDuration: 86400000, minimumWinners: 1, maximumWinners: 10,
    minimumDuration: 300000, maximumDuration: 2592000000, allowedRoles: [], bypassRoles: [],
  },
  birthday: { defaultRole: null, announcementChannel: null, timezone: 'UTC' },
  verification: {
    defaultMessage: 'Click the button below to verify yourself and gain access to the server!',
    defaultButtonText: 'Verify',
    autoVerify: {
      defaultCriteria: 'none', defaultAccountAgeDays: 7, serverSizeThreshold: 1000,
      minAccountAge: 1, maxAccountAge: 365, sendDMNotification: true,
      criteria: { account_age: 'Account must be older than specified days', server_size: 'All users if server has less than 1000 members', none: 'All users immediately' },
    },
    verificationCooldown: 5000, maxVerificationAttempts: 3, attemptWindow: 60000,
    maxCooldownEntries: 10000, maxAttemptEntries: 10000, cooldownCleanupInterval: 300000,
    maxAuditMetadataBytes: 4096, maxInMemoryAuditEntries: 1000, logAllVerifications: true, keepAuditTrail: true,
  },
  welcome: {
    defaultWelcomeMessage: 'Welcome {user} to {server}! We now have {memberCount} members!',
    defaultGoodbyeMessage: '{user} has left the server. We now have {memberCount} members.',
    defaultWelcomeChannel: null, defaultGoodbyeChannel: null,
  },
  counters: {
    defaults: { name: '{name} Counter', description: 'Server {name} counter', type: 'voice', channelName: '{name}-{count}' },
    permissions: { deny: ['VIEW_CHANNEL'], allow: ['VIEW_CHANNEL', 'CONNECT', 'SPEAK'] },
    messages: { created: 'Created counter **{name}**', deleted: 'Deleted counter **{name}**', updated: 'Updated counter **{name}**' },
    types: {
      members: { name: 'Members', description: 'Total members in the server', getCount: (guild) => guild.memberCount.toString() },
      bots: { name: 'Bots', description: 'Total bot accounts in the server', getCount: (guild) => guild.members.cache.filter((m) => m.user.bot).size.toString() },
      members_only: { name: 'Humans', description: 'Total human members (non-bots)', getCount: (guild) => guild.members.cache.filter((m) => !m.user.bot).size.toString() },
    },
  },
  messages: {
    noPermission: 'You do not have permission to use this command.',
    cooldownActive: 'Please wait {time} before using this command again.',
    errorOccurred: 'An error occurred while executing this command.',
    missingPermissions: 'I am missing required permissions to perform this action.',
    commandDisabled: 'This command has been disabled.',
    maintenanceMode: 'The bot is currently in maintenance mode.',
  },
  features: {
    economy: false, leveling: false, moderation: true, logging: true, welcome: true,
    tickets: true, giveaways: true, birthday: true, counter: true, verification: true,
    reactionRoles: true, joinToCreate: true, voice: true, search: true, tools: true,
    utility: true, community: true, fun: true,
  },
};

export function validateConfig() {
  const errors = [];
  if (!process.env.DISCORD_TOKEN && !process.env.TOKEN) errors.push('Bot token is required (DISCORD_TOKEN or TOKEN).');
  if (!process.env.CLIENT_ID) errors.push('Client ID is required (CLIENT_ID).');
  if (errors.length === 0) logger.debug('Luxe configuration validated successfully.');
  return errors;
}

const configErrors = validateConfig();
if (configErrors.length > 0) logger.error('Bot configuration errors:', configErrors.join('\n'));
export const BotConfig = botConfig;
export function getColor(path, fallback = '#99AAB5') {
  if (typeof path === 'number') return path;
  if (typeof path === 'string' && path.startsWith('#')) return parseInt(path.replace('#', ''), 16);
  return fallback;
}
export function getRandomColor() { return '#99AAB5'; }
export default botConfig;
