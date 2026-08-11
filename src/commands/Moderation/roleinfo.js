import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed, EMBED_SPACER } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder().setName('roleinfo').setDescription('Show detailed role information').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles).addRoleOption(o => o.setName('role').setDescription('Role to inspect').setRequired(true)),
  category: 'Moderation',
  async execute(interaction) {
    const role = interaction.options.getRole('role', true);
    const members = role.members?.size ?? 0;
    await InteractionHelper.safeReply(interaction, { embeds: [createEmbed({ title: `🎭 Role Info - ${role.name}`, description: `**🎭 Role:** ${role}\n**🆔 Role ID:** ${role.id}\n**👥 Members:** ${members}\n**📍 Position:** ${role.position}\n**🔗 Mentionable:** ${role.mentionable ? 'Yes' : 'No'}\n**🤖 Managed:** ${role.managed ? 'Yes' : 'No'}\n**📅 Created:** <t:${Math.floor(role.createdTimestamp / 1000)}:F>`, fields: [EMBED_SPACER] })] });
  },
};
