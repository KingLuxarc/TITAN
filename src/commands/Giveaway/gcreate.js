import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes, handleInteractionError } from '../../utils/errorHandler.js';
import { saveGiveaway } from '../../utils/giveaways.js';
import { parseDuration, validatePrize, validateWinnerCount, createGiveawayEmbed } from '../../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('gcreate')
        .setDescription('Starts a new giveaway in a specified channel.')
        .addStringOption((option) =>
            option.setName('duration').setDescription('How long the giveaway should last (e.g., 1h, 30m, 5d).').setRequired(true),
        )
        .addIntegerOption((option) =>
            option.setName('winners').setDescription('The number of winners to pick.').setMinValue(1).setMaxValue(10).setRequired(true),
        )
        .addStringOption((option) =>
            option.setName('prize').setDescription('The giveaway name/prize.').setRequired(true),
        )
        .addStringOption((option) =>
            option.setName('description').setDescription('An optional description for the giveaway.').setRequired(false),
        )
        .addChannelOption((option) =>
            option.setName('channel').setDescription('The channel to send the giveaway to (defaults to current channel).').addChannelTypes(ChannelType.GuildText).setRequired(false),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        try {
            if (!interaction.inGuild()) {
                throw new TitanBotError('Giveaway command used outside guild', ErrorTypes.VALIDATION, 'This command can only be used in a server.', { userId: interaction.user.id });
            }

            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                throw new TitanBotError('User lacks ManageGuild permission', ErrorTypes.PERMISSION, "You need the 'Manage Server' permission to start a giveaway.", { userId: interaction.user.id, guildId: interaction.guildId });
            }

            logger.info(`Giveaway creation started by ${interaction.user.tag} in guild ${interaction.guildId}`);

            const durationString = interaction.options.getString('duration');
            const winnerCount = interaction.options.getInteger('winners');
            const prize = interaction.options.getString('prize');
            const description = interaction.options.getString('description')?.trim() || null;
            const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

            const durationMs = parseDuration(durationString);
            validateWinnerCount(winnerCount);
            const prizeName = validatePrize(prize);

            if (description && description.length > 4096) {
                throw new TitanBotError('Giveaway description too long', ErrorTypes.VALIDATION, 'The description must be 4096 characters or fewer.');
            }

            if (!targetChannel.isTextBased()) {
                throw new TitanBotError('Target channel is not text-based', ErrorTypes.VALIDATION, 'The channel must be a text channel.', { channelId: targetChannel.id, channelType: targetChannel.type });
            }

            const endTime = Date.now() + durationMs;
            const initialGiveawayData = {
                messageId: 'placeholder',
                channelId: targetChannel.id,
                guildId: interaction.guildId,
                prize: prizeName,
                description,
                hostId: interaction.user.id,
                endTime,
                endsAt: endTime,
                winnerCount,
                participants: [],
                isEnded: false,
                ended: false,
                createdAt: new Date().toISOString(),
            };

            const components = createGiveawayEmbed(initialGiveawayData, 'active');

            const giveawayMessage = await targetChannel.send({
                components: [components],
                flags: MessageFlags.IsComponentsV2,
            });

            initialGiveawayData.messageId = giveawayMessage.id;
            const saved = await saveGiveaway(interaction.client, interaction.guildId, initialGiveawayData);
            if (!saved) logger.warn(`Failed to save giveaway: ${giveawayMessage.id}`);

            try {
                await logEvent({
                    client: interaction.client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.GIVEAWAY_CREATE,
                    data: {
                        description: `Giveaway created: ${prizeName}`,
                        channelId: targetChannel.id,
                        userId: interaction.user.id,
                        fields: [
                            { name: 'Prize', value: prizeName, inline: true },
                            { name: 'Winners', value: winnerCount.toString(), inline: true },
                            { name: 'Duration', value: durationString, inline: true },
                            { name: 'Channel', value: targetChannel.toString(), inline: true },
                        ],
                    },
                });
            } catch (logError) {
                logger.debug('Error logging giveaway creation event:', logError);
            }

            await InteractionHelper.safeReply(interaction, {
                embeds: [successEmbed('Giveaway Started!', `A new giveaway for **${prizeName}** has been started in ${targetChannel} and will end in **${durationString}**.`)],
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            await handleInteractionError(interaction, error, { type: 'command', commandName: 'gcreate', context: 'giveaway_creation' });
        }
    },
};
