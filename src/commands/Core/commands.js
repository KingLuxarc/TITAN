import { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const ADMIN_CATEGORIES = new Set(['moderation']);
const ADMIN_COMMANDS = new Set(['commands', 'permission', 'configwizard', 'logging', 'app-admin', 'serverstats', 'channelinfo', 'roleinfo']);

function isAdminCommand(command) {
  const name = command?.data?.name?.toLowerCase();
  const category = command?.category?.toLowerCase();
  return !!name && (ADMIN_CATEGORIES.has(category) || ADMIN_COMMANDS.has(name));
}

function buildPanel(title, groups) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  for (const [category, commands] of groups) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${category}**\n${commands.map(c => `\`/${c}\``).join(' • ')}`));
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  }
  return container;
}

export default {
  data: new SlashCommandBuilder()
    .setName('commands')
    .setDescription('Browse Luxe commands by access level')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addStringOption(o => o.setName('type').setDescription('Which commands to show').setRequired(true).addChoices(
      { name: 'All', value: 'all' },
      { name: 'Admin', value: 'admin' },
      { name: 'Public', value: 'public' },
    )),
  category: 'Core',
  async execute(interaction, config, client) {
    const type = interaction.options.getString('type', true);
    const commands = [...client.commands.values()].filter(c => c?.data?.name);
    const filtered = commands.filter(command => {
      const admin = isAdminCommand(command);
      if (type === 'admin') return admin;
      if (type === 'public') return !admin;
      return true;
    });
    const groups = new Map();
    for (const command of filtered) {
      const category = command.category || 'Other';
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(command.data.name);
    }
    const sorted = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([category, names]) => [category, names.sort()]);
    const title = type === 'admin' ? '🛡️ Admin Commands' : type === 'public' ? '📖 Public Commands' : '📋 All Luxe Commands';
    const container = buildPanel(title, sorted.length ? sorted : [['Commands', ['No commands loaded.']]]);
    return InteractionHelper.safeReply(interaction, { components: [container], flags: MessageFlags.IsComponentsV2 });
  },
};
