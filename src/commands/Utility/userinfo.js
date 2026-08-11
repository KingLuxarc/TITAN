import { SlashCommandBuilder, ContainerBuilder, SeparatorBuilder, SeparatorSpacingSize, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

function timestamp(date) {
  return date ? `<t:${Math.floor(date.getTime() / 1000)}:F>` : 'Not available';
}

function roleMentions(member) {
  if (!member) return 'None';
  const roles = member.roles.cache.filter((role) => role.id !== member.guild.id).sort((a, b) => b.position - a.position);
  if (!roles.size) return 'None';
  return roles.map((role) => `<@&${role.id}>`).slice(0, 10).join(', ');
}

export default {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Get detailed information about a user')
    .addUserOption((option) => option.setName('target').setDescription('The user to inspect (defaults to you)')),

  async execute(interaction) {
    try {
      const deferSuccess = await InteractionHelper.safeDefer(interaction);
      if (!deferSuccess) return;

      const user = interaction.options.getUser('target') || interaction.user;
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      const createdAt = user.createdAt;
      const joinedAt = member?.joinedAt;
      const highestRole = member?.roles?.highest;
      const roles = member ? member.roles.cache.filter((role) => role.id !== interaction.guild.id) : new Map();

      const container = new ContainerBuilder();
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## 👤 User Info - ${user.username}`),
            new TextDisplayBuilder().setContent(`**Person:** <@${user.id}>\n**User ID:** ${user.id}\n**Bot:** ${user.bot ? 'Yes' : 'No'}`),
          )
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(user.displayAvatarURL({ extension: 'png', size: 256 }))),
      );

      container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**📅 Account Created:** ${timestamp(createdAt)}\n**🚪 Joined Server:** ${timestamp(joinedAt)}\n**🏷️ Nickname:** ${member?.nickname || 'None'}\n**👑 Highest Role:** ${highestRole && highestRole.id !== interaction.guild.id ? `<@&${highestRole.id}>` : 'None'}`),
      );
      container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**🎭 Roles (${roles.size}):**\n${roleMentions(member)}`),
      );

      await InteractionHelper.safeEditReply(interaction, { components: [container], flags: MessageFlags.IsComponentsV2 });
      logger.info('UserInfo command executed', { userId: interaction.user.id, targetUserId: user.id, guildId: interaction.guildId });
    } catch (error) {
      logger.error('UserInfo command execution failed', { error: error.message, stack: error.stack, userId: interaction.user.id, guildId: interaction.guildId });
      await handleInteractionError(interaction, error, { commandName: 'userinfo', source: 'userinfo_command' });
    }
  },
};
