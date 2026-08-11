import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, RoleSelectMenuBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getGuildConfig, updateGuildConfig } from '../../services/guildConfig.js';

const MENU_ID = 'luxe-permission-role';

function panel(config, mode = null) {
  const roles = Array.isArray(config.botAccessRoles) ? config.botAccessRoles : [];
  const roleText = roles.length ? roles.map(id => `<@&${id}>`).join(', ') : '*No custom admin roles are configured.*';
  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🔐 Admin Command Permissions'))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Roles allowed to use admin commands:**\n${roleText}\n\nServer administrators always have access. Normal, fun, cool, and public commands are available to everyone.`));

  if (mode) {
    container
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(mode === 'add' ? '**Add admin access**\nSelect roles below.' : '**Remove admin access**\nSelect roles below.'))
      .addActionRowComponents(new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId(`${MENU_ID}:${mode}`)
          .setPlaceholder(mode === 'add' ? 'Select roles to allow' : 'Select roles to remove')
          .setMinValues(1)
          .setMaxValues(10),
      ));
  }

  return { components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
}

export default {
  data: new SlashCommandBuilder()
    .setName('permission')
    .setDescription('Manage which roles can use admin commands')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o
      .setName('type')
      .setDescription('Add or remove admin command access; leave empty to view current access')
      .setRequired(false)
      .addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' })),
  category: 'Core',
  async execute(interaction) {
    const mode = interaction.options.getString('type');
    const config = await getGuildConfig(interaction.client, interaction.guildId);
    await InteractionHelper.safeReply(interaction, panel(config, mode));

    if (!mode) return;

    const reply = await interaction.fetchReply().catch(() => null);
    if (!reply) return;
    const collector = reply.createMessageComponentCollector({
      time: 120000,
      filter: i => i.user.id === interaction.user.id && i.customId === `${MENU_ID}:${mode}`,
    });

    collector.on('collect', async component => {
      try {
        const current = await getGuildConfig(interaction.client, interaction.guildId);
        const existing = new Set(current.botAccessRoles || []);
        for (const id of component.values) mode === 'add' ? existing.add(id) : existing.delete(id);
        const nextRoles = [...existing];
        await updateGuildConfig(interaction.client, interaction.guildId, { botAccessRoles: nextRoles }, { userId: interaction.user.id });
        await component.update(panel({ ...current, botAccessRoles: nextRoles }, mode));
      } catch (error) {
        await component.reply({ content: 'Something went wrong while updating admin permissions.', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    });
  },
};