// Slash-command compatibility adapter.
// Prefix/message-command handling has been removed from Luxe.
// This module only provides the slash access-key helper used by the interaction pipeline.

export function resolveSlashAccessKey(interaction) {
  if (!interaction?.isChatInputCommand?.()) {
    return String(interaction?.commandName || '').toLowerCase().trim();
  }

  const commandName = String(interaction.commandName || '').toLowerCase().trim();
  const subcommandGroup = interaction.options?.getSubcommandGroup?.(false);
  const subcommand = interaction.options?.getSubcommand?.(false);

  if (subcommandGroup && subcommand) return `${commandName} ${subcommandGroup} ${subcommand}`;
  if (subcommand) return `${commandName} ${subcommand}`;
  return commandName;
}
