import { MessageFlags, ContainerBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, PermissionFlagsBits } from 'discord.js';

export default {
  name: 'bans_revoke_select',
  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) return interaction.reply({ content: 'You need Ban Members permission.', flags: MessageFlags.Ephemeral });
    const userId = interaction.values[0];
    const ban = await interaction.guild.bans.fetch(userId).catch(() => null);
    if (!ban) return interaction.update({ components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('## ⚠️ Ban Not Found')).addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)).addTextDisplayComponents(new TextDisplayBuilder().setContent('That user is no longer banned. Refresh `/bans` and try again.'))] });
    await interaction.guild.bans.remove(userId, `Ban revoked by ${interaction.user.tag}`);
    const c = new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🔓 Ban Revoked')).addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)).addTextDisplayComponents(new TextDisplayBuilder().setContent(`**👥 Person:** <@${userId}> (${userId})\n\nThe ban has been successfully revoked.`));
    await interaction.update({ components: [c], flags: MessageFlags.IsComponentsV2 });
  },
};
