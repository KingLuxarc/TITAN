import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Send a message as Luxe')
    .addStringOption(o => o.setName('message').setDescription('The message to send').setRequired(true))
    .addAttachmentOption(o => o.setName('file').setDescription('Optional file to attach').setRequired(false)),
  category: 'Tools',
  async execute(interaction) {
    const message = interaction.options.getString('message', true);
    const file = interaction.options.getAttachment('file');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.channel.send({ content: message, files: file ? [file.url] : [] });
    await InteractionHelper.safeEditReply(interaction, { content: '✅ Message sent.' });
  },
};
