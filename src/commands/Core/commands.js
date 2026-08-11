import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from '../../utils/embeds.js';
import { getCommandAccessSnapshot } from '../../services/commandAccessService.js';

export default {
  data: new SlashCommandBuilder().setName('commands').setDescription('Browse every Luxe command').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).setDMPermission(false)
    .addSubcommand(s => s.setName('list').setDescription('Show every command, including admin commands'))
    .addSubcommand(s => s.setName('dashboard').setDescription('Open the command access dashboard'))
    .addSubcommand(s => s.setName('disable').setDescription('Disable a command or category').addStringOption(o => o.setName('scope').setDescription('Command or category').setRequired(true).addChoices({ name: 'Category', value: 'category' }, { name: 'Command', value: 'command' })).addStringOption(o => o.setName('target').setDescription('Target name').setRequired(true)))
    .addSubcommand(s => s.setName('enable').setDescription('Enable a command or category').addStringOption(o => o.setName('scope').setDescription('Command or category').setRequired(true).addChoices({ name: 'Category', value: 'category' }, { name: 'Command', value: 'command' })).addStringOption(o => o.setName('target').setDescription('Target name').setRequired(true))),
  category: 'Core',
  async execute(interaction, config, client) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'list') {
      const snapshot = getCommandAccessSnapshot(client, config || {});
      const groups = snapshot.categories.map(c => `**${c.icon} ${c.displayName}**\n${c.commands.map(x => `\`/${x.name}\``).join(' • ')}`).join('\n\n');
      return InteractionHelper.safeReply(interaction, { embeds: [createEmbed({ title: '📋 All Luxe Commands', description: groups || 'No commands loaded.' })] });
    }
    if (sub === 'dashboard') return InteractionHelper.safeReply(interaction, { embeds: [createEmbed({ title: '🛠️ Command Dashboard', description: 'Use `/commands disable` or `/commands enable` to manage commands and categories.' })] });
    const scope = interaction.options.getString('scope', true).toLowerCase();
    const target = interaction.options.getString('target', true).toLowerCase();
    const { disableCommand, enableCommand, disableCategory, enableCategory, resolveCategoryChoice } = await import('../../services/commandAccessService.js');
    if (scope === 'category') {
      const category = resolveCategoryChoice(client, target);
      if (!category) throw new Error(`Unknown category: ${target}`);
      if (sub === 'disable') await disableCategory(client, interaction.guildId, category.key); else await enableCategory(client, interaction.guildId, category.key);
      return InteractionHelper.safeReply(interaction, { embeds: [createEmbed({ title: sub === 'disable' ? '🚫 Category Disabled' : '✅ Category Enabled', description: `**${category.displayName}** has been ${sub === 'disable' ? 'disabled' : 'enabled'}.` })] });
    }
    if (sub === 'disable') await disableCommand(client, interaction.guildId, target); else await enableCommand(client, interaction.guildId, target);
    return InteractionHelper.safeReply(interaction, { embeds: [createEmbed({ title: sub === 'disable' ? '🚫 Command Disabled' : '✅ Command Enabled', description: `\`/${target}\` has been ${sub === 'disable' ? 'disabled' : 'enabled'}.` })] });
  },
};
