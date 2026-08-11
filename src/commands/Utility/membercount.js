import { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName('membercount')
    .setDescription('Show the server member count'),
  category: 'Utility',
  async execute(interaction) {
    const guild = interaction.guild;
    await guild.members.fetch().catch(() => null);
    const members = guild.members.cache;
    const bots = members.filter(member => member.user.bot).size;
    const people = Math.max(0, members.size - bots);
    const total = members.size;

    const container = new ContainerBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 👥 ${guild.name} Member Count`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**👤 People:** ${people}\n**🤖 Bots:** ${bots}\n**👥 Total Members:** ${total}`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**📊 Community Split**\nPeople: ${people} • Bots: ${bots}`));

    return InteractionHelper.safeReply(interaction, { components: [container], flags: MessageFlags.IsComponentsV2 });
  },
};
