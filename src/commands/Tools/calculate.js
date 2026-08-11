import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { evaluateMathExpression } from '../../utils/safeMathParser.js';

const calculationContexts = new Map();
function evaluate(expression) { return evaluateMathExpression(expression); }
export { calculationContexts };

export default {
    data: new SlashCommandBuilder().setName('calculate').setDescription('Evaluate a mathematical expression').addStringOption((option) => option.setName('expression').setDescription('The mathematical expression to evaluate').setRequired(true)),
    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) return;
        try {
            const expression = interaction.options.getString('expression');
            if (!/^[0-9+\-*/.()^%! ,<>=&|~?:\[\]{}a-z√π∞°]+$/i.test(expression)) return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Contains unsupported characters.' });
            const dangerousPatterns = [/\b(?:import|require|process|fs|child_process|exec|eval|Function|setTimeout|setInterval|new\s+Function)\s*\(/i, /`/g, /\$\{.*\}/, /\b(?:localStorage|document|window|fetch|XMLHttpRequest)\b/, /\b(?:while|for)\s*\([^)]*\)\s*\{/, /\b(?:function\*|yield|await|async)\b/];
            for (const pattern of dangerousPatterns) if (pattern.test(expression)) return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Code-like syntax is not allowed in calculations.' });
            let result;
            try { result = evaluate(expression); } catch (error) {
                logger.error('Calculation error:', error);
                let message = 'Failed to evaluate the expression. Please check the syntax and try again.';
                if (error.message.includes('Unexpected type')) message = 'The expression contains an unsupported operation or function.';
                else if (error.message.includes('Undefined symbol')) message = 'The expression contains an undefined variable or function.';
                else if (error.message.includes('Brackets not balanced')) message = 'The expression has unbalanced brackets.';
                else if (error.message.includes('Unexpected operator') || error.message.includes('Unexpected character')) message = 'The expression contains an invalid operator or character.';
                return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message });
            }
            let formattedResult;
            if (typeof result === 'number') {
                formattedResult = result.toLocaleString('en-US', { maximumFractionDigits: 10 });
                if (Math.abs(result) > 0 && (Math.abs(result) >= 1e10 || Math.abs(result) < 1e-3)) formattedResult = result.toExponential(6);
            } else if (typeof result === 'boolean') formattedResult = result ? 'true' : 'false';
            else if (result === null || result === undefined) formattedResult = 'No result';
            else if (Array.isArray(result) || typeof result === 'object') formattedResult = '```json\n' + JSON.stringify(result, null, 2) + '\n```';
            else formattedResult = String(result);

            const rootKey = `${interaction.user.id}_current_${interaction.id}`;
            calculationContexts.set(rootKey, { expression, formattedResult, userId: interaction.user.id });
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`calc_${interaction.id}_add`).setLabel('+').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`calc_${interaction.id}_subtract`).setLabel('-').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`calc_${interaction.id}_multiply`).setLabel('×').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`calc_${interaction.id}_divide`).setLabel('÷').setStyle(ButtonStyle.Primary),
            );
            const embed = successEmbed('🧮 Calculation Result', `**Expression:** \`${expression.replace(/`/g, '\\`')}\`\n**Result:** \`${formattedResult}\`\n\n*Use the buttons below to perform operations with the result.*`);
            await InteractionHelper.safeEditReply(interaction, { embeds: [embed], components: [row] });

            const filter = (i) => i.customId.startsWith(`calc_${interaction.id}_`) && i.user.id === interaction.user.id;
            const collector = interaction.channel.createMessageComponentCollector({ filter, time: 300000 });
            collector.on('collect', async (i) => {
                try {
                    const operation = i.customId.split('_')[2];
                    const current = calculationContexts.get(rootKey);
                    const operator = { add: '+', subtract: '-', multiply: '*', divide: '/' }[operation];
                    if (!current || !operator) return await i.reply({ content: '⏱️ This calculator has expired. Use `/calculate` again.', flags: 64 });
                    const contextKey = `${i.user.id}_${interaction.id}_${operation}`;
                    calculationContexts.set(contextKey, { expression: current.expression, formattedResult: current.formattedResult, operator, rootKey, messageId: interaction.message?.id, channelId: interaction.channelId, userId: i.user.id });
                    await i.showModal({ customId: `calc_modal:${operation}`, title: `Enter a number to ${operation}`, components: [{ type: 1, components: [{ type: 4, customId: `operand:${contextKey}`, label: `Number to ${operator} with ${current.formattedResult}`, placeholder: 'Enter a number...', style: 1, required: true, maxLength: 50 }] }] });
                } catch (error) {
                    logger.error('Button interaction error:', error);
                    if (!i.replied && !i.deferred) await i.reply({ content: 'An error occurred while processing your request.', flags: 64 }).catch(() => {});
                }
            });
            collector.on('end', () => { calculationContexts.delete(rootKey); interaction.editReply({ components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`calc_${interaction.id}_expired`).setLabel('Calculator Expired').setStyle(ButtonStyle.Secondary).setDisabled(true))] }).catch(() => {}); });
        } catch (error) { await handleInteractionError(interaction, error, { type: 'command', commandName: 'calculate' }); }
    },
};
