import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed, EMBED_SPACER } from '../../utils/embeds.js';

const types = new Map(Object.entries(ChannelType).map(([k, v]) => [v, k]));
export default {
  data: new SlashCommandBuilder().setName('channelinfo').setDescription('Show detailed channel information').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels).addChannelOption(o => o.setName('channel').setDescription('Channel to inspect').setRequired(false)),
  category: 'Moderation',
  async execute(interaction) {
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const created = channel.createdTimestamp ? `<t:${Math.floor(channel.createdTimestamp / 1000)}:F>` : 'Unknown';
    await InteractionHelper.safeReply(interaction, { embeds: [createEmbed({ title: `📺 Channel Info - ${channel.name}`, description: `${channel}\n\n**📌 Details**\n**Type:** ${types.get(channel.type) || 'Unknown'}\n**ID:** ${channel.id}\n**Created:** ${created}\n\n**⚙️ Settings**\n**Category:** ${channel.parent ? channel.parent.toString() : 'None'}\n**Position:** ${channel.position ?? 'Unknown'}\n**NSFW:** ${channel.nsfw ? 'Yes' : 'No'}`, fields: [EMBED_SPACER] })] });
  },
};
