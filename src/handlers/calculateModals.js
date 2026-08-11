import { successEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';
import { evaluateMathExpression } from '../utils/safeMathParser.js';
import { replyUserError, ErrorTypes } from '../utils/errorHandler.js';

function evaluate(expression) { return evaluateMathExpression(expression); }

async function calculateModalHandler(interaction, client, args) {
    try {
        const modalFields = interaction.fields;
        const fieldCollection = modalFields?.fields;
        const operandInput = fieldCollection?.first?.();
        const customId = operandInput?.customId;
        const contextKey = customId?.split(':')[1];
        if (!contextKey) return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Failed to retrieve calculation context.' });

        const { calculationContexts } = await import('../commands/Tools/calculate.js');
        const context = calculationContexts.get(contextKey);
        if (!context) return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'This calculation has expired. Please start a new calculation.' });

        await interaction.deferReply({ ephemeral: true });
        const operandText = modalFields.getTextInputValue(customId)?.trim();
        const operand = Number(operandText);
        if (!operandText || !Number.isFinite(operand)) return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Please provide a valid number.' });

        // Use the raw mathematical value rather than the display-formatted result.
        // Display formatting can contain spaces/commas which the math parser correctly rejects.
        const baseExpression = context.rawExpression ?? context.expression;
        const newExpression = `(${baseExpression}) ${context.operator} (${operandText})`;
        const newResult = evaluate(newExpression);
        let formattedNewResult = typeof newResult === 'number' ? newResult.toLocaleString('en-US', { maximumFractionDigits: 10 }) : String(newResult);
        if (typeof newResult === 'number' && Math.abs(newResult) > 0 && (Math.abs(newResult) >= 1e10 || Math.abs(newResult) < 1e-3)) formattedNewResult = newResult.toExponential(6);

        if (context.rootKey) calculationContexts.set(context.rootKey, {
            expression: newExpression,
            rawExpression: newExpression,
            formattedResult: formattedNewResult,
            userId: context.userId
        });
        calculationContexts.delete(contextKey);
        await interaction.editReply({ embeds: [successEmbed('🧮 Calculated', `\`${newExpression}\` = \`${formattedNewResult}\``)] });
    } catch (error) {
        logger.error('Calculate modal handler error:', error);
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'An error occurred processing your calculation. Please try again.' }).catch(() => {});
    }
}

export default { execute: calculateModalHandler };
