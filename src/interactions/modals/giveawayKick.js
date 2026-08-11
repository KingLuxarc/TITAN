import { MessageFlags, EmbedBuilder } from 'discord.js';
import { getGuildGiveaways, saveGiveaway, isGiveawayEnded } from '../../utils/giveaways.js';
import { createGiveawayEmbed } from '../../services/giveawayService.js';

export default {
    name: 'giveaway_kick_modal',
    async execute(interaction, client, args = []) {
        const messageId = args[0];
        if (!messageId) {
            return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Kick Participant').setDescription('The giveaway could not be identified.')], flags: MessageFlags.Ephemeral });
        }

        const giveaways = await getGuildGiveaways(client, interaction.guildId);
        const giveaway = giveaways.find((item) => item.messageId === messageId);
        if (!giveaway) {
            return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Kick Participant').setDescription('This giveaway could not be found.')], flags: MessageFlags.Ephemeral });
        }

        const canManage = Boolean(
            interaction.member?.permissions?.has('ManageGuild')
            || (giveaway.hostId && giveaway.hostId === interaction.user.id),
        );
        if (!canManage) {
            return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Permission Denied').setDescription('Only the giveaway host or a member with Manage Server can kick participants.')], flags: MessageFlags.Ephemeral });
        }

        if (isGiveawayEnded(giveaway) || giveaway.ended || giveaway.isEnded) {
            return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Giveaway Ended').setDescription('You cannot kick participants after the giveaway has ended.')], flags: MessageFlags.Ephemeral });
        }

        const userId = interaction.fields.getTextInputValue('participant_id').trim().replace(/[<@!>]/g, '');
        const participants = Array.isArray(giveaway.participants) ? giveaway.participants : [];
        const index = participants.indexOf(userId);
        if (index === -1) {
            return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Participant Not Found').setDescription('That user is not currently entered in this giveaway.')], flags: MessageFlags.Ephemeral });
        }

        participants.splice(index, 1);
        giveaway.participants = participants;
        await saveGiveaway(client, interaction.guildId, giveaway);

        const channel = await interaction.guild.channels.fetch(giveaway.channelId).catch(() => null);
        const message = channel ? await channel.messages.fetch(messageId).catch(() => null) : null;
        if (message) {
            await message.edit({ components: [createGiveawayEmbed(giveaway, 'active')] });
        }

        return interaction.reply({
            embeds: [new EmbedBuilder().setTitle('Participant Kicked').setDescription(`<@${userId}> has been removed from **${giveaway.prize}**.\n\nThere are now **${participants.length}** participant${participants.length === 1 ? '' : 's'}.`)],
            flags: MessageFlags.Ephemeral,
        });
    },
};
