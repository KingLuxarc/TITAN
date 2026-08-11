import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, RoleSelectMenuBuilder, ContainerBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, MessageFlags } from 'discord.js';
import { getGuildConfig, setConfigValue } from '../../services/guildConfig.js';

function panel(guild, roles) {
  const container = new ContainerBuilder();
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🔐 Luxe Bot Permissions'));
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(roles.length ? `**Allowed roles:** ${roles.map((id) => `<@&${id}>`).join(', ')}` : '**Allowed roles:** Everyone\n\nNo role restriction is currently enabled.'));
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('Select a role below to add or remove it from Luxe access. Server administrators always retain access.'));
  container.addActionRowComponents(new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId(`permissions_select:${guild.id}`).setPlaceholder('🛡️ Select a role to toggle').setMinValues(1).setMaxValues(1)));
  return container;
}

export default {
  category: 'Core',
  data: new SlashCommandBuilder().setName('permissions').setDescription('Choose which roles can use Luxe.').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    const config = await getGuildConfig(interaction.client, interaction.guildId);
    await interaction.reply({ components: [panel(interaction.guild, config.botAccessRoles || [])], flags: MessageFlags.IsComponentsV2 });
  },
};
export { panel };
