import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, RoleSelectMenuBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getGuildConfig, updateGuildConfig } from '../../services/guildConfig.js';

const MENU_ID = 'luxe-permission-role';
const REMOVE_ID = 'luxe-permission-remove';

function panel(config, mode) {
  const roles = Array.isArray(config.botAccessRoles) ? config.botAccessRoles : [];
  const roleText = roles.length ? roles.map(id => `<@&${id}>`).join(', ') : '*No custom admin roles are configured.*';
  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🔐 Admin Command Permissions`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Select who can use admin commands.**\n\nServer administrators always have access.\n\n**🛡️ Allowed Roles**\n${roleText}`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  const menu = new RoleSelectMenuBuilder().setCustomId(`${MENU_ID}:${mode}`).setPlaceholder(mode === 'add' ? 'Select roles to allow' : 'Select roles to remove').setMinValues(1).setMaxValues(10);
  const row = new ActionRowBuilder().addComponents(menu);
  return { components: [container, row], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
}

export default {
  data: new SlashCommandBuilder().setName('permission').setDescription('Manage which roles can use admin commands').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addStringOption(o => o.setName('type').setDescription('Add or remove admin command access').setRequired(true).addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' })),
  category: 'Core',
  async execute(interaction) {
    const mode = interaction.options.getString('type', true);
    const config = await getGuildConfig(interaction.client, interaction.guildId);
    await InteractionHelper.safeReply(interaction, panel(config, mode));
    const reply = await interaction.fetchReply().catch(() => null);
    if (!reply) return;
    const collector = reply.createMessageComponentCollector({ time: 120000, filter: i => i.user.id === interaction.user.id && i.customId === `${MENU_ID}:${mode}` });
    collector.on('collect', async component => {
      const current = await getGuildConfig(interaction.client, interaction.guildId);
      const existing = new Set(current.botAccessRoles || []);
      for (const id of component.values) mode === 'add' ? existing.add(id) : existing.delete(id);
      await updateGuildConfig(interaction.client, interaction.guildId, { botAccessRoles: [...existing] }, { userId: interaction.user.id });
      await component.update(panel({ ...current, botAccessRoles: [...existing] }, mode));
    });
  },
};
