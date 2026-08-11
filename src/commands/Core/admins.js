import { SlashCommandBuilder, ContainerBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, MessageFlags } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfig.js';

export default {
  category: 'Core',
  data: new SlashCommandBuilder().setName('admins').setDescription('View the roles allowed to use Luxe.'),
  async execute(interaction) {
    const config = await getGuildConfig(interaction.client, interaction.guildId);
    const roles = Array.isArray(config.botAccessRoles) ? config.botAccessRoles : [];
    const container = new ContainerBuilder();
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🛡️ Luxe Access Roles'));
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(roles.length ? roles.map((id, index) => `**${index + 1}.** <@&${id}>`).join('\n') : '🌐 **Everyone** — no role restriction is enabled.'));
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('👑 Server administrators always have access.'));
    await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  },
};
