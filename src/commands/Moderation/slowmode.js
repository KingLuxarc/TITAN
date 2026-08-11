import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { successEmbed } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder().setName('slowmode').setDescription('Set channel slowmode').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels).addIntegerOption(o => o.setName('seconds').setDescription('Delay in seconds (0 disables)').setRequired(true).setMinValue(0).setMaxValue(21600)),
  category: 'Moderation',
  async execute(interaction) {
    const seconds = interaction.options.getInteger('seconds', true);
    await interaction.channel.setRateLimitPerUser(seconds, `Changed by ${interaction.user.tag}`);
    await InteractionHelper.safeReply(interaction, { embeds: [successEmbed('🐢 Slowmode Updated', seconds ? `Slowmode is now **${seconds} seconds**.` : 'Slowmode has been **disabled**.')] });
  },
};
