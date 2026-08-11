import { MessageFlags, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder } from 'discord.js';
import { getGuildGiveaways, saveGiveaway, isGiveawayEnded } from '../../utils/giveaways.js';
import { addGiveawayDivider, createGiveawayEmbed } from '../../services/giveawayService.js';

const EPHEMERAL_V2 = MessageFlags.Ephemeral | MessageFlags.IsComponentsV2;

export default {
    name: 'giveaway_kick_select',
    async execute(interaction, client, args = []) {
        const messageId = args[0];
        const userId = interaction.values?.[0];
        const giveaways = await getGuildGiveaways(client, interaction.guildId);
        const giveaway = giveaways.find((item) => item.messageId === messageId);
        const notice = (title, body, emoji) => {
            const container = new ContainerBuilder();
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${emoji} ${title}`));
            addGiveawayDivider(container);
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
            return container;
        };

        if (!giveaway || !userId) return interaction.update({ components: [notice('Giveaway Not Found', 'This giveaway could not be found.', '⚠️')] });

        const canManage = Boolean(
            interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild)
            || (giveaway.hostId && giveaway.hostId === interaction.user.id),
        );
        if (!canManage) return interaction.update({ components: [notice('Permission Denied', 'Only the giveaway host or a member with Manage Server can kick participants.', '🚫')] });
        if (isGiveawayEnded(giveaway) || giveaway.ended || giveaway.isEnded || Number(giveaway.endsAt ?? giveaway.endTime) <= Date.now()) {
            return interaction.update({ components: [notice('Giveaway Ended', 'You cannot kick participants after the giveaway has ended.', '🏁')] });
        }

        const participants = Array.isArray(giveaway.participants) ? giveaway.participants : [];
        const index = participants.indexOf(userId);
        if (index === -1) return interaction.update({ components: [notice('Participant Not Found', 'That user is no longer entered in this giveaway.', '⚠️')] });

        participants.splice(index, 1);
        giveaway.participants = participants;
        await saveGiveaway(client, interaction.guildId, giveaway);

        const container = notice('Participant Removed', `<@${userId}> has been removed from **${giveaway.prize}**.\n\n**👥 Remaining:** ${participants.length} participant${participants.length === 1 ? '' : 's'}`, '✅');
        await interaction.update({ components: [container], flags: EPHEMERAL_V2 });

        const channel = await interaction.guild.channels.fetch(giveaway.channelId).catch(() => null);
        const message = channel ? await channel.messages.fetch(messageId).catch(() => null) : null;
        if (message) await message.edit({ components: [createGiveawayEmbed(giveaway, 'active')] }).catch(() => {});
    },
};
