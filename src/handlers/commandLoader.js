import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Collection } from 'discord.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MAX_COMMANDS = 100;
const COMMAND_COUNT_WARN_THRESHOLD = 90;

const ADMIN_COMMANDS = new Set([
    'commands', 'permission', 'configwizard', 'logging', 'app-admin',
    'serverstats', 'channelinfo', 'roleinfo', 'admins'
]);

function isAdminCommand(command) {
    const category = command?.category?.toLowerCase?.();
    return category === 'moderation' || ADMIN_COMMANDS.has(command?.data?.name?.toLowerCase?.());
}

function getSubcommandInfo(commandData) {
    const subcommands = [];
    if (commandData.options) {
        for (const option of commandData.options) {
            if (option.type === 1) subcommands.push(option.name);
            else if (option.type === 2 && option.options) {
                for (const subOption of option.options) if (subOption.type === 1) subcommands.push(`${option.name}/${subOption.name}`);
            }
        }
    }
    return subcommands;
}

function addVisibilityOption(options) {
    if (!Array.isArray(options)) return;
    const hasSubcommands = options.some(option => option.type === 1 || option.type === 2);

    if (hasSubcommands) {
        for (const option of options) {
            if (option.type === 1) {
                option.options ??= [];
                if (!option.options.some(child => child.name === 'visible')) {
                    option.options.push({
                        type: 5,
                        name: 'visible',
                        description: 'Show the confirmation to everyone instead of only you',
                        required: false,
                    });
                }
            } else if (option.type === 2) {
                addVisibilityOption(option.options);
            }
        }
        return;
    }

    if (!options.some(option => option.name === 'visible')) {
        options.push({
            type: 5,
            name: 'visible',
            description: 'Show the confirmation to everyone instead of only you',
            required: false,
        });
    }
}

async function getAllFiles(directory, fileList = []) {
    const files = await fs.readdir(directory, { withFileTypes: true });
    for (const file of files) {
        const filePath = path.join(directory, file.name);
        if (file.isDirectory()) {
            if (file.name === 'modules') continue;
            await getAllFiles(filePath, fileList);
        } else if (file.name.endsWith('.js')) fileList.push(filePath);
    }
    return fileList;
}

export async function loadCommands(client) {
    client.commands = new Collection();
    const commandsPath = path.join(__dirname, '../commands');
    const commandFiles = await getAllFiles(commandsPath);
    logger.info(`Found ${commandFiles.length} command files to load`);
    const uniqueCommandNames = new Set();

    for (const filePath of commandFiles) {
        try {
            const normalizedPath = filePath.replace(/\\/g, '/');
            const commandModule = await import(`file://${filePath}`);
            const command = commandModule.default || commandModule;
            if (!command.data || !command.execute) {
                logger.warn(`Command at ${filePath} is missing required "data" or "execute" property.`);
                continue;
            }
            const category = path.basename(path.dirname(filePath));
            command.category = category;
            command.filePath = normalizedPath;
            const primaryCommandName = command.data.name;
            if (!uniqueCommandNames.has(primaryCommandName)) {
                uniqueCommandNames.add(primaryCommandName);
                client.commands.set(primaryCommandName, command);
            }
            const subcommands = getSubcommandInfo(command.data.toJSON());
            logger.info(`Loaded command: ${primaryCommandName} from ${normalizedPath} (category: ${category})`);
            if (subcommands.length > 0) logger.info(`  - Subcommands: ${subcommands.join(', ')}`);
        } catch (error) {
            logger.error(`Error loading command from ${filePath}:`, error);
        }
    }
    logger.info(`Loaded ${client.commands.size} commands`);
    return client.commands;
}

function collectCommandPayloads(client) {
    const commands = [];
    let totalSubcommands = 0;
    const registeredNames = new Set();

    for (const command of client.commands.values()) {
        if (!command.data || typeof command.data.toJSON !== 'function') continue;
        const commandName = command.data.name;
        if (registeredNames.has(commandName)) continue;
        registeredNames.add(commandName);
        const commandJson = command.data.toJSON();

        // Discord's command-level default permissions cannot express our per-role
        // /permission system. Moderation commands are therefore registered without
        // a Discord-level permission gate and enforced at runtime by permissionGuard.
        if (command.category?.toLowerCase?.() === 'moderation') delete commandJson.default_member_permissions;

        // Admin/moderation commands get a common optional visibility control at the
        // end of their options. This is injected into the registration payload so
        // individual command files do not need to duplicate the option definition.
        if (isAdminCommand(command)) addVisibilityOption(commandJson.options);

        commands.push(commandJson);
        totalSubcommands += getSubcommandInfo(commandJson).length;
    }
    return { commands, totalSubcommands };
}

function validateCommands(commands) {
    const validationErrors = [];
    for (const cmd of commands) {
        if (cmd.name && cmd.name.length > 32) validationErrors.push(`Command ${cmd.name} has name longer than 32 chars`);
        if (cmd.description && cmd.description.length > 110) validationErrors.push(`Command ${cmd.name} has description longer than 110 chars`);
        if (!cmd.options) continue;
        for (const option of cmd.options) {
            if (option.name && option.name.length > 32) validationErrors.push(`Command ${cmd.name} option ${option.name} has name longer than 32 chars`);
            if (option.description && option.description.length > 110) validationErrors.push(`Command ${cmd.name} option ${option.name} has description longer than 110 chars`);
            if (option.choices) for (const choice of option.choices) {
                if (choice.name && choice.name.length > 110) validationErrors.push(`Command ${cmd.name} choice ${choice.name} has name longer than 110 chars`);
                if (typeof choice.value === 'string' && choice.value.length > 100) validationErrors.push(`Command ${cmd.name} choice ${choice.name} has value longer than 100 chars`);
            }
            if (!option.options) continue;
            for (const subOption of option.options) {
                if (subOption.name && subOption.name.length > 32) validationErrors.push(`Command ${cmd.name} subcommand option ${subOption.name} has name longer than 32 chars`);
                if (subOption.description && subOption.description.length > 110) validationErrors.push(`Command ${cmd.name} subcommand option ${subOption.name} has description longer than 110 chars`);
            }
        }
    }
    if (validationErrors.length) throw new Error(`Command validation failed with ${validationErrors.length} errors: ${validationErrors.join('; ')}`);
}

function prepareCommandsForRegistration(commands, { multiGuild = false } = {}) {
    if (commands.length >= COMMAND_COUNT_WARN_THRESHOLD) logger.warn(`Command count (${commands.length}) is near Discord's ${MAX_COMMANDS} limit${multiGuild ? ' for global registration' : ' for guild registration'}`);
    if (commands.length <= MAX_COMMANDS) return commands;
    logger.warn(`Command count (${commands.length}) exceeds Discord limit (${MAX_COMMANDS}), truncating...`);
    return commands.slice(0, MAX_COMMANDS);
}

async function registerGlobalCommands(client, clientId, commands, totalSubcommands) {
    if (!clientId) throw new Error('CLIENT_ID is required for global command registration when MULTI_GUILD=true');
    if (!client.rest) throw new Error('Discord REST client is not available for global command registration');
    validateCommands(commands);
    const commandsToRegister = prepareCommandsForRegistration(commands, { multiGuild: true });
    await client.rest.put(`/applications/${clientId}/commands`, { body: commandsToRegister });
    logger.info(`Successfully registered ${commandsToRegister.length} global commands`);
}

async function registerGuildCommands(client, guildId, commands, totalSubcommands) {
    validateCommands(commands);
    const guild = await client.guilds.fetch(guildId);
    const existingCommands = await guild.commands.fetch();
    const commandsToRegister = prepareCommandsForRegistration(commands, { multiGuild: false });
    try {
        await guild.commands.set(commandsToRegister);
        const registeredCommands = await guild.commands.fetch();
        logger.info(`Successfully registered ${registeredCommands.size} guild commands`);
    } catch (error) {
        logger.error('Failed to register commands:', error);
        if (existingCommands.size > 0) await guild.commands.set(existingCommands.map((cmd) => cmd)).catch(() => {});
        throw error;
    }
}

export async function registerCommands(client, options = {}) {
    const { clientId = null, guildId = null, multiGuild = false } = options;
    try {
        const { commands, totalSubcommands } = collectCommandPayloads(client);
        if (multiGuild) return await registerGlobalCommands(client, clientId, commands, totalSubcommands);
        if (!guildId) { logger.warn('Command registration skipped: set GUILD_ID for single-server setup, or MULTI_GUILD=true for multi-server support'); return; }
        await registerGuildCommands(client, guildId, commands, totalSubcommands);
    } catch (error) {
        logger.error('Error registering commands:', error);
        throw error;
    }
}

export async function reloadCommand(client, commandName) {
    const command = client.commands.get(commandName);
    if (!command) return { success: false, message: `Command "${commandName}" not found` };
    try {
        const commandPath = path.resolve(command.filePath);
        const moduleUrl = pathToFileURL(commandPath);
        moduleUrl.searchParams.set('t', Date.now().toString());
        const newCommand = (await import(moduleUrl.href)).default;
        client.commands.set(commandName, newCommand);
        logger.info(`Reloaded command: ${commandName}`);
        return { success: true, message: `Successfully reloaded command "${commandName}"` };
    } catch (error) {
        logger.error(`Error reloading command "${commandName}":`, error);
        return { success: false, message: `Error reloading command: ${error.message}` };
    }
}