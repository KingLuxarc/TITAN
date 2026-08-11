import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ContainerBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';

const PAGE_SIZE = 7;

function pagePanel(guild, bans, page) {
  const totalPages = Math.max(1, Math.ceil(bans.length / PAGE_SIZE));
  const safe = Math.min(Math.max(page, 0), totalPages - 1);
  const slice = bans.slice(safe * PAGE_SIZE, safe * PAGE_SIZE + PAGE_SIZE);
  const c = new ContainerBuilder();
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🛡️ ${guild.name} Bans:`));
  c.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  const entries = slice.length
    ? slice.map((ban) => `**👥 Person:** <@${ban.user.id}> (${ban.user.id})\n**⁉️ Reason:** ${ban.reason?.trim() || 'No reason provided'}`).join('\n\n')
    : 'There are no banned members.';
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(entries));
  c.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bans_prev:${safe}`).setLabel('◀️').setStyle(ButtonStyle.Secondary).setDisabled(safe === 0),
    new ButtonBuilder().setCustomId(`bans_next:${safe}`).setLabel('▶️').setStyle(ButtonStyle.Secondary).setDisabled(safe >= totalPages - 1),
    new ButtonBuilder().setCustomId('bans_revoke').setLabel('🔓 Revoke Ban').setStyle(ButtonStyle.Danger),
  ));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Page ${safe + 1}/${totalPages} • ${bans.length} total`));
  return c;
}

function canManageBans(interaction) {
  return interaction.member.permissions.has(PermissionFlagsBits.BanMembers) || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
}

export const prev = { name: 'bans_prev', async execute(interaction) {
  if (!canManageBans(interaction)) return interaction.reply({ content: 'You need access to server moderation.', flags: MessageFlags.Ephemeral });
  const page = Math.max(0, Number(interaction.customId.split(':')[1] || 0) - 1);
  const bans = [...await interaction.guild.bans.fetch()];
  await interaction.update({ components: [pagePanel(interaction.guild, bans, page)], flags: MessageFlags.IsComponentsV2 });
} };

export const next = { name: 'bans_next', async execute(interaction) {
  if (!canManageBans(interaction)) return interaction.reply({ content: 'You need access to server moderation.', flags: MessageFlags.Ephemeral });
  const page = Number(interaction.customId.split(':')[1] || 0) + 1;
  const bans = [...await interaction.guild.bans.fetch()];
  await interaction.update({ components: [pagePanel(interaction.guild, bans, page)], flags: MessageFlags.IsComponentsV2 });
} };

export const revoke = { name: 'bans_revoke', async execute(interaction) {
  if (!canManageBans(interaction)) return interaction.reply({ content: 'You need access to server moderation.', flags: MessageFlags.Ephemeral });
  const bans = [...await interaction.guild.bans.fetch()];
  const menu = new StringSelectMenuBuilder().setCustomId('bans_revoke_select').setPlaceholder('🔓 Select a banned member').setMinValues(1).setMaxValues(1);
  for (const ban of bans.slice(0, 25)) menu.addOptions(new StringSelectMenuOptionBuilder().setLabel(ban.user.username.slice(0, 100)).setDescription(ban.user.id).setValue(ban.user.id));
  const c = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🔓 Revoke Ban'))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('Select a **currently banned** member to unban them.'))
    .addActionRowComponents(new ActionRowBuilder().addComponents(menu));
  await interaction.reply({ components: [c], flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
} };

export default [prev, next, revoke];
