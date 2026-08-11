import { successEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';
import { evaluateMathExpression } from '../utils/safeMathParser.js';
import { replyUserError, ErrorTypes } from '../utils/errorHandler.js';

function evaluate(expression) {
    return evaluateMathExpression(expression);
}

async function calculateModalHandler(interaction, client, args) {
    try {
        const operation = args[0];
        const operandInput = interaction.fields.first();
        const contextKey = operandInput?.customId?.split(':')[1];
        if (!contextKey) return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Failed to retrieve calculation context.' });

        const { calculationContexts } = await import('../commands/Tools/calculate.js');
        const context = calculationContexts.get(contextKey);
        if (!context) return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'This calculation has expired. Please start a new calculation.' });

        await interaction.deferReply({ ephemeral: true });
        const operand = interaction.fields.getTextInputValue(operandInput.customId);
        if (!operand || Number.isNaN(Number(operand))) return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Please provide a valid number.' });

        const { expression, operator } = context;
        const newExpression = `(${expression}) ${operator} (${operand})`;
        const newResult = evaluate(newExpression);
        let formattedNewResult = typeof newResult === 'number'
            ? newResult.toLocaleString('en-US', { maximumFractionDigits: 10 })
            : String(newResult);
        if (typeof newResult === 'number' && Math.abs(newResult) > 0 && (Math.abs(newResult) >= 1e10 || Math.abs(newResult) < 1e-3)) formattedNewResult = newResult.toExponential(6);

        const updatedEmbed = successEmbed('🧮 Calculation Result', `**Expression:** \`${newExpression.replace(/`/g, '\\`')}\`\n**Result:** \`${formattedNewResult}\`\n\n*Use the buttons below to perform more operations.*`);
        if (context.messageId && context.channelId) {
            try {
                const channel = await client.channels.fetch(context.channelId);
                const message = await channel.messages.fetch(context.messageId);
                await message.edit({ embeds: [updatedEmbed] });
            } catch (editError) {
                logger.warn('Could not edit original calculator message:', editError.message);
            }
        }

        calculationContexts.delete(contextKey);
        await interaction.editReply({ embeds: [successEmbed('✅ Calculated', `\`${newExpression}\` = \`${formattedNewResult}\``)] });
    } catch (error) {
        logger.error('Calculate modal handler error:', error);
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'An error occurred processing your calculation. Please try again.' }).catch(() => {});
    }
}

export default { execute: calculateModalHandler };
