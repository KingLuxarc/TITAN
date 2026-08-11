import { MessageFlags } from 'discord.js';
import { getGuildGiveaways, saveGiveaway, isGiveawayEnded } from '../../utils/giveaways.js';
import { PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder } from 'discord.js';
import { addGiveawayDivider } from '../../services/giveawayService.js';

const EPHEMERAL_V2 = MessageFlags.Ephemeral | MessageFlags.IsComponentsV2;

export default {
    name: 'giveaway_kick_select',
    async execute(interaction, client, args = []) {
        const messageId = args[0];
        const userId = interaction.values?.[0];
        const giveaways = await getGuildGiveaways(client, interaction.guildId);
        const giveaway = giveaways.find((item) => item.messageId === messageId);
        if (!giveaway || !userId) {
            return interaction.update({
                components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('## ⚠️ Giveaway\n\nThis giveaway could not be found.'))],
            });
        }

        const canManage = Boolean(
            interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild)
            || (giveaway.hostId && giveaway.hostId === interaction.user.id),
        );
        if (!canManage) {
            const container = new ContainerBuilder();
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🚫 Permission Denied'));
            addGiveawayDivider(container);
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent('Only the giveaway host or a member with Manage Server can kick participants.'));
            return interaction.update({ components: [container] });
        }

        if (isGiveawayEnded(giveaway) || giveaway.ended || giveaway.isEnded || Number(giveaway.endsAt ?? giveaway.endTime) <= Date.now()) {
            const container = new ContainerBuilder();
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🏁 Giveaway Ended'));
            addGiveawayDivider(container);
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent('You cannot kick participants after the giveaway has ended.'));
            return interaction.update({ components: [container] });
        }

        const participants = Array.isArray(giveaway.participants) ? giveaway.participants : [];
        const index = participants.indexOf(userId);
        if (index === -1) {
            const container = new ContainerBuilder();
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## ⚠️ Participant Not Found'));
            addGiveawayDivider(container);
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent('That user is no longer entered in this giveaway.'));
            return interaction.update({ components: [container] });
        }

        participants.splice(index, 1);
        giveaway.participants = participants;
        await saveGiveaway(client, interaction.guildId, giveaway);

        const container = new ContainerBuilder();
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## ✅ Participant Removed'));
        addGiveawayDivider(container);
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`<@${userId}> has been removed from **${giveaway.prize}**.\n\n**👥 Remaining:** ${participants.length} participant${participants.length === 1 ? '' : 's'}`));
        await interaction.update({ components: [container], flags: EPHEMERAL_V2 });

        const channel = await interaction.guild.channels.fetch(giveaway.channelId).catch(() => null);
        const message = channel ? await channel.messages.fetch(messageId).catch(() => null) : null;
        if (message) {
            const { createGiveawayEmbed } = await import('../../services/giveawayService.js');
            await message.edit({ components: [createGiveawayEmbed(giveaway, 'active')] }).catch(() => {});
        }
    },
};
