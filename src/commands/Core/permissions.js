import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, RoleSelectMenuBuilder, ContainerBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, MessageFlags } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfig.js';

function panel(guild, roles) {
  const container = new ContainerBuilder();
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🔐 Luxe Admin Command Permissions'));
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(roles.length ? `**🛡️ Allowed admin roles:** ${roles.map((id) => `<@&${id}>`).join(', ')}` : '**🛡️ Allowed admin roles:** None configured'));
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('Select which roles may use **admin and moderation commands**. Normal, fun, utility, and other public commands remain available to everyone. Server administrators always retain access.'));
  container.addActionRowComponents(new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId(`permissions_select:${guild.id}`).setPlaceholder('🛡️ Select a role to toggle admin access').setMinValues(1).setMaxValues(1)));
  return container;
}

export default {
  category: 'Core',
  data: new SlashCommandBuilder().setName('permissions').setDescription('Select who can use admin commands.').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    const config = await getGuildConfig(interaction.client, interaction.guildId);
    await interaction.reply({ components: [panel(interaction.guild, config.botAccessRoles || [])], flags: MessageFlags.IsComponentsV2 });
  },
};
export { panel };
