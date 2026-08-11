import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { successEmbed } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder().setName('role').setDescription('Add or remove a role from a member').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles).addStringOption(o => o.setName('type').setDescription('Action').setRequired(true).addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' })).addUserOption(o => o.setName('person').setDescription('Member').setRequired(true)).addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true)),
  category: 'Moderation',
  async execute(interaction) {
    const type = interaction.options.getString('type', true);
    const user = interaction.options.getUser('person', true);
    const role = interaction.options.getRole('role', true);
    const member = await interaction.guild.members.fetch(user.id);
    if (role.managed) throw new Error('That role is managed by Discord and cannot be assigned manually.');
    if (role.position >= interaction.guild.members.me.roles.highest.position) throw new Error('That role is higher than my highest role.');
    if (type === 'add') await member.roles.add(role, `Role added by ${interaction.user.tag}`);
    else await member.roles.remove(role, `Role removed by ${interaction.user.tag}`);
    await InteractionHelper.safeReply(interaction, { embeds: [successEmbed(type === 'add' ? '🎭 Role Added' : '🎭 Role Removed', `${role} was ${type === 'add' ? 'added to' : 'removed from'} ${member}.`)] });
  },
};
