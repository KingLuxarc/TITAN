import { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock the current channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  category: 'Moderation',
  async execute(interaction) {
    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false }, { reason: 'Channel locked' });
    const lockedAt = Math.floor(Date.now() / 1000);
    const container = new ContainerBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🔒 Channel Locked 🔒'))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('This channel has been locked by a server administrator.'))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**🔒 Channel:** ${interaction.channel}\n**⏰ Locked:** <t:${lockedAt}:F>\n**📌 Status:** Members cannot send messages until the channel is unlocked.`));
    await InteractionHelper.safeReply(interaction, { components: [container], flags: MessageFlags.IsComponentsV2 });
  },
};
