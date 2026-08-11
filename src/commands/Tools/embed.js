import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

function parseHex(value) {
  if (!value) return null;
  const hex = value.startsWith('#') ? value : `#${value}`;
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error('Colour must be a valid hex colour such as `#5865F2`.');
  return parseInt(hex.slice(1), 16);
}

export default {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Send a custom embed as Luxe')
    .addStringOption(o => o.setName('title').setDescription('Embed title').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('Embed description').setRequired(true))
    .addStringOption(o => o.setName('colour').setDescription('Optional hex colour, e.g. #5865F2').setRequired(false))
    .addAttachmentOption(o => o.setName('file').setDescription('Optional file to attach').setRequired(false)),
  category: 'Tools',
  async execute(interaction) {
    try {
      const title = interaction.options.getString('title', true);
      const description = interaction.options.getString('description', true);
      const colour = interaction.options.getString('colour');
      const file = interaction.options.getAttachment('file');
      const embed = new EmbedBuilder().setTitle(title).setDescription(description);
      const parsed = parseHex(colour);
      if (parsed !== null) embed.setColor(parsed);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await interaction.channel.send({ embeds: [embed], files: file ? [file.url] : [] });
      await InteractionHelper.safeEditReply(interaction, { content: '✅ Embed sent.' });
    } catch (error) {
      if (interaction.deferred || interaction.replied) {
        await InteractionHelper.safeEditReply(interaction, { content: `❌ ${error.message}` });
      } else {
        await interaction.reply({ content: `❌ ${error.message}`, flags: MessageFlags.Ephemeral });
      }
    }
  },
};
