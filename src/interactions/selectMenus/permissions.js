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
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🔐 Luxe Bot Permissions'));
    c.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(index >= 0 ? `❌ Removed ${role} from Luxe access.` : `✅ Added ${role} to Luxe access.`));
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(roles.length ? `**Allowed roles:** ${roles.map((id) => `<@&${id}>`).join(', ')}` : '**Allowed roles:** Everyone'));
    await interaction.update({ components: [c], flags: MessageFlags.IsComponentsV2 });
  },
};
