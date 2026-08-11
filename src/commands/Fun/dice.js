import { SlashCommandBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { successEmbed } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder().setName('dice').setDescription('Roll a random number').addIntegerOption(o => o.setName('minimum').setDescription('Minimum value').setRequired(true)).addIntegerOption(o => o.setName('maximum').setDescription('Maximum value').setRequired(true)),
  category: 'Fun',
  async execute(interaction) {
    const min = interaction.options.getInteger('minimum', true);
    const max = interaction.options.getInteger('maximum', true);
    if (min > max) return InteractionHelper.safeReply(interaction, { embeds: [successEmbed('🎲 Invalid Roll', 'Minimum must be less than or equal to maximum.')] });
    const result = Math.floor(Math.random() * (max - min + 1)) + min;
    await InteractionHelper.safeReply(interaction, { embeds: [successEmbed('🎲 Dice Roll', `You rolled **${result}**\n\nRange: **${min} → ${max}**`)] });
  },
};
