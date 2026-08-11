import { SlashCommandBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from '../../utils/embeds.js';

const ADMIN_CATEGORIES = new Set(['moderation']);
const ADMIN_COMMANDS = new Set(['commands', 'permission', 'configwizard', 'logging', 'app-admin', 'serverstats']);

function isPublicCommand(command) {
  const name = command?.data?.name?.toLowerCase();
  const category = command?.category?.toLowerCase();
  return name && !ADMIN_CATEGORIES.has(category) && !ADMIN_COMMANDS.has(name);
}

export default {
  data: new SlashCommandBuilder().setName('help').setDescription('Show commands everyone can use'),
  category: 'Core',
  async execute(interaction, config, client) {
    const groups = new Map();
    for (const command of client.commands.values()) {
      if (!isPublicCommand(command)) continue;
      const category = command.category || 'Other';
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(`\`/${command.data.name}\` — ${command.data.description || 'No description'}`);
    }
    const description = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([category, commands]) => `**${category}**\n${commands.sort().join('\n')}`).join('\n\n');
    await InteractionHelper.safeReply(interaction, { embeds: [createEmbed({ title: '📖 Luxe Help', description: description || 'No public commands are currently loaded.' })] });
  },
};
