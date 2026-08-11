import { ContainerBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { getGuildConfig, setConfigValue } from '../../services/guildConfig.js';

export default {
  name: 'permissions_select',
  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: 'You need Administrator permission.', flags: MessageFlags.Ephemeral });
    const roleId = interaction.values[0];
    const role = interaction.guild.roles.cache.get(roleId);
    if (!role) return interaction.reply({ content: 'That role no longer exists.', flags: MessageFlags.Ephemeral });
    const config = await getGuildConfig(interaction.client, interaction.guildId);
    const roles = Array.isArray(config.botAccessRoles) ? [...config.botAccessRoles] : [];
    const index = roles.indexOf(roleId);
    if (index >= 0) roles.splice(index, 1); else roles.push(roleId);
    await setConfigValue(interaction.client, interaction.guildId, 'botAccessRoles', roles, interaction.user.id);
    const c = new ContainerBuilder();
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🔐 Luxe Admin Command Permissions'));
    c.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(index >= 0 ? `❌ Removed ${role} from **admin/moderation command** access.` : `✅ Added ${role} to **admin/moderation command** access.`));
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(roles.length ? `**🛡️ Allowed admin roles:** ${roles.map((id) => `<@&${id}>`).join(', ')}` : '**🛡️ Allowed admin roles:** None configured'));
    c.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent('Normal, fun, utility, and other public commands remain available to everyone. Server administrators always retain access.'));
    await interaction.update({ components: [c], flags: MessageFlags.IsComponentsV2 });
  },
};
