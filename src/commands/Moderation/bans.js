import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, MessageFlags } from 'discord.js';

const PAGE_SIZE = 7;

function buildPage(guild, bans, page) {
  const totalPages = Math.max(1, Math.ceil(bans.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const pageBans = bans.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const container = new ContainerBuilder();

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🛡️ ${guild.name} Bans:`));
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

  const entries = pageBans.length
    ? pageBans.map((ban) => {
        const reason = ban.reason?.trim() || 'No reason provided';
        return `**👥 Person:** <@${ban.user.id}> (${ban.user.id})\n**⁉️ Reason:** ${reason}`;
      }).join('\n\n')
    : 'There are no banned members.';

  // Keep all seven entries in one TextDisplay so the Components V2 container stays within Discord's component limit.
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(entries));
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  container.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bans_prev:${safePage}`).setLabel('◀️').setStyle(ButtonStyle.Secondary).setDisabled(safePage === 0),
    new ButtonBuilder().setCustomId(`bans_next:${safePage}`).setLabel('▶️').setStyle(ButtonStyle.Secondary).setDisabled(safePage >= totalPages - 1),
    new ButtonBuilder().setCustomId('bans_revoke').setLabel('🔓 Revoke Ban').setStyle(ButtonStyle.Danger),
  ));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Page ${safePage + 1}/${totalPages} • ${bans.length} total ban${bans.length === 1 ? '' : 's'}`));
  return container;
}

export default {
  category: 'Moderation',
  data: new SlashCommandBuilder().setName('bans').setDescription('View and revoke server bans.').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) return interaction.reply({ content: 'You need Ban Members permission.', flags: MessageFlags.Ephemeral });
    try {
      const bans = [...await interaction.guild.bans.fetch()];
      await interaction.reply({ components: [buildPage(interaction.guild, bans, 0)], flags: MessageFlags.IsComponentsV2 });
    } catch (error) {
      await interaction.reply({ content: 'I could not retrieve this server\'s bans. Make sure Luxe has the required ban permissions.', flags: MessageFlags.Ephemeral }).catch(() => {});
      throw error;
    }
  },
};

export { buildPage, PAGE_SIZE };
