import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { successEmbed } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder().setName('lock').setDescription('Lock the current channel').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  category: 'Moderation',
  async execute(interaction) {
    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false }, { reason: `Locked by ${interaction.user.tag}` });
    await InteractionHelper.safeReply(interaction, { embeds: [successEmbed('🔒 Channel Locked', `${interaction.channel} is now locked.`)] });
  },
};
