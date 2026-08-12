import 'dotenv/config';
import { Client, Collection, GatewayIntentBits } from 'discord.js';
import cron from 'node-cron';

import config from './config/application.js';
import { initializeDatabase } from './utils/database.js';
import { logger, startupLog, shutdownLog } from './utils/logger.js';
import { checkBirthdays } from './services/birthdayService.js';
import { checkGiveaways } from './services/giveawayService.js';
import { loadCommands, registerCommands as registerSlashCommands } from './handlers/commandLoader.js';

class LuxeBot extends Client {
  constructor() {
    super({ intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildBans,
    ] });
    this.config = config;
    this.commands = new Collection();
    this.events = new Collection();
    this.buttons = new Collection();
    this.selectMenus = new Collection();
    this.modals = new Collection();
    this.cooldowns = new Collection();
    this.db = null;
  }

  async start() {
    try {
      startupLog('Starting bot...');
      startupLog('Initializing storage...');
      const dbInstance = await initializeDatabase();
      this.db = dbInstance.db;
      const dbStatus = this.db.getStatus();
      startupLog(`Storage connected: ${dbStatus.connectionType}`);
      startupLog('Loading commands...');
      await loadCommands(this);
      startupLog(`Loaded ${this.commands.size} commands`);
      startupLog('Loading event and interaction handlers...');
      await this.loadHandlers();
      startupLog('Logging into Discord...');
      await this.login(this.config.bot.token);
      startupLog('Registering slash commands...');
      await this.registerCommands();
      this.setupCronJobs();
      startupLog(`ONLINE ✅ | ${this.commands.size} commands loaded`);
    } catch (error) {
      logger.error('Failed to start bot:', error);
      process.exit(1);
    }
  }

  setupCronJobs() {
    cron.schedule('0 6 * * *', () => checkBirthdays(this));
    cron.schedule('*/10 * * * * *', () => checkGiveaways(this));
  }

  async loadHandlers() {
    for (const name of ['events', 'interactions']) {
      try {
        const module = await import(`./handlers/${name}.js`);
        const loader = module.default;
        if (typeof loader !== 'function') throw new Error(`Invalid loader export from ${name}.js`);
        await loader(this);
        startupLog(`Loaded ${name}`);
      } catch (error) {
        logger.error(`Failed to load ${name}:`, error);
        throw error;
      }
    }
  }

  async registerCommands() {
    const { clientId, guildId, multiGuild } = this.config.bot;
    if (!clientId) throw new Error('CLIENT_ID is required.');
    if (multiGuild) {
      startupLog('Multi-guild mode enabled: registering slash commands globally.');
      await registerSlashCommands(this, { clientId, multiGuild: true });
      return;
    }
    if (!guildId) throw new Error('GUILD_ID is required when MULTI_GUILD=false.');
    await registerSlashCommands(this, { clientId, guildId, multiGuild: false });
  }

  async shutdown(reason = 'UNKNOWN') {
    shutdownLog(`Bot is shutting down (${reason})...`);
    try {
      cron.getTasks().forEach((task) => task.stop());
      if (this.db?.db?.pool) await this.db.db.pool.end();
      if (this.isReady()) this.destroy();
      shutdownLog('Bot stopped successfully.');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}

const bot = new LuxeBot();
process.on('SIGTERM', () => bot.shutdown('SIGTERM'));
process.on('SIGINT', () => bot.shutdown('SIGINT'));
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  bot.shutdown('UNCAUGHT_EXCEPTION');
});
process.on('unhandledRejection', (reason) => logger.error('Unhandled rejection:', reason));
bot.start();

export default LuxeBot;
