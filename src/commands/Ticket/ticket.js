import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ContainerBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfig.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import ticketConfig from './modules/ticket_dashboard.js';

function ticketPanel(description, buttonLabel) {
  const container = new ContainerBuilder();
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🎫 Support Tickets'));
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(description));
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  container.addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('create_ticket').setLabel(buttonLabel).setStyle(ButtonStyle.Primary).setEmoji('📩')));
  return container;
}
function resultPanel(title, body) {
  const container = new ContainerBuilder();
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}`));
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
  return container;
}

export default {
  data: new SlashCommandBuilder().setName('ticket').setDescription("Manages the server's ticket system.").setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((s) => s.setName('setup').setDescription('Sets up the ticket creation panel in a channel.')
      .addChannelOption((o) => o.setName('panel_channel').setDescription('Channel where the panel will be sent.').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addStringOption((o) => o.setName('panel_message').setDescription('Main panel description.').setRequired(true))
      .addStringOption((o) => o.setName('button_label').setDescription('Ticket button label.').setRequired(false))
      .addChannelOption((o) => o.setName('category').setDescription('Ticket category.').addChannelTypes(ChannelType.GuildCategory).setRequired(false))
      .addChannelOption((o) => o.setName('closed_category').setDescription('Closed ticket category.').addChannelTypes(ChannelType.GuildCategory).setRequired(false))
      .addRoleOption((o) => o.setName('staff_role').setDescription('Ticket staff role.').setRequired(false))
      .addIntegerOption((o) => o.setName('max_tickets_per_user').setDescription('Maximum tickets per user.').setMinValue(1).setMaxValue(10).setRequired(false))
      .addBooleanOption((o) => o.setName('dm_on_close').setDescription('DM the user when closed.').setRequired(false)))
    .addSubcommand((s) => s.setName('dashboard').setDescription('Open the interactive ticket dashboard')),
  category: 'Ticket',
  async execute(interaction, config, client) {
    try {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) return replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need `Manage Channels` for this action.' });
      const subcommand = interaction.options.getSubcommand();
      if (subcommand === 'dashboard') return ticketConfig.execute(interaction, config, client);
      const existingConfig = await getGuildConfig(client, interaction.guildId);
      if (existingConfig?.ticketPanelChannelId) return replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `This server already has a ticket system in <#${existingConfig.ticketPanelChannelId}>. Use \`/ticket dashboard\` to edit it.` });
      const panelChannel = interaction.options.getChannel('panel_channel');
      const categoryChannel = interaction.options.getChannel('category');
      const closedCategoryChannel = interaction.options.getChannel('closed_category');
      const staffRole = interaction.options.getRole('staff_role');
      const panelMessage = interaction.options.getString('panel_message') || 'Click the button below to create a support ticket.';
      const buttonLabel = interaction.options.getString('button_label') || 'Create Ticket';
      const maxTicketsPerUser = interaction.options.getInteger('max_tickets_per_user') || 3;
      const dmOnClose = interaction.options.getBoolean('dm_on_close') !== false;
      const sentPanel = await panelChannel.send({ components: [ticketPanel(panelMessage, buttonLabel)], flags: MessageFlags.IsComponentsV2 });
      const currentConfig = existingConfig;
      currentConfig.ticketCategoryId = categoryChannel?.id || null;
      currentConfig.ticketClosedCategoryId = closedCategoryChannel?.id || null;
      currentConfig.ticketStaffRoleId = staffRole?.id || null;
      currentConfig.ticketPanelChannelId = panelChannel.id;
      currentConfig.ticketPanelMessageId = sentPanel.id;
      currentConfig.ticketPanelMessage = panelMessage;
      currentConfig.ticketButtonLabel = buttonLabel;
      currentConfig.maxTicketsPerUser = maxTicketsPerUser;
      currentConfig.dmOnClose = dmOnClose;
      const { getGuildConfigKey } = await import('../../utils/database.js');
      await client.db.set(getGuildConfigKey(interaction.guildId), currentConfig);
      await InteractionHelper.safeReply(interaction, { components: [resultPanel('🎫 Ticket Panel Set Up', `The Components V2 ticket panel has been sent to ${panelChannel}.\n\n**Category:** ${categoryChannel ? categoryChannel.name : 'Automatic'}\n**Staff Role:** ${staffRole ? staffRole.toString() : 'Not restricted'}\n**Max Tickets:** ${maxTicketsPerUser}\n**DM on Close:** ${dmOnClose ? 'Enabled' : 'Disabled'}`)], flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
    } catch (error) {
      logger.error('Error executing ticket command', { error: error.message, stack: error.stack, guildId: interaction.guildId });
      await handleInteractionError(interaction, error, { commandName: 'ticket', source: 'ticket_command_main' });
    }
  },
};
