import { MemoryStorage } from '../memoryStorage.js';
import { logger } from '../logger.js';
import { validateGuildConfigOrThrow } from '../schemas.js';

class DatabaseWrapper {
    constructor() {
        this.initialized = false;
        this.db = null;
        this.connectionType = 'local';
    }

    async initialize() {
        if (this.initialized) return;
        this.db = new MemoryStorage();
        await this.db.initialize?.();
        this.initialized = true;
        logger.info('Local persistent storage initialized');
    }

    async set(key, value, ttl = null) {
        if (typeof key === 'string' && /^guild:[^:]+:config$/.test(key)) {
            const guildId = key.split(':')[1];
            validateGuildConfigOrThrow(value, { guildId, errorCode: 'VALIDATION_FAILED' });
        }
        return this.db.set(key, value, ttl);
    }

    async get(key, defaultValue = null) { return this.db.get(key, defaultValue); }
    async delete(key) { return this.db.delete(key); }
    async list(prefix) { return this.db.list(prefix); }
    async exists(key) { return this.db.exists(key); }
    async increment(key, amount = 1) { return this.db.increment(key, amount); }
    async decrement(key, amount = 1) { return this.db.decrement(key, amount); }
    isDegraded() { return false; }
    isAvailable() { return Boolean(this.db); }
    getStatus() {
        return { initialized: this.initialized, connectionType: this.connectionType, isDegraded: false, isAvailable: this.isAvailable(), degradedReason: null };
    }
    getConnectionType() { return this.connectionType; }
}

export const db = new DatabaseWrapper();

export async function initializeDatabase() {
    await db.initialize();
    return { db };
}

export async function getFromDb(key, defaultValue = null) {
    try {
        const value = await db.get(key);
        return value === null ? defaultValue : value;
    } catch (error) {
        logger.error(`Error getting value for key ${key}:`, error);
        return defaultValue;
    }
}

export async function setInDb(key, value, ttl = null) {
    try {
        await db.set(key, value, ttl);
        return true;
    } catch (error) {
        logger.error(`Error setting value for key ${key}:`, error);
        return false;
    }
}

export async function deleteFromDb(key) {
    try {
        await db.delete(key);
        return true;
    } catch (error) {
        logger.error(`Error deleting key ${key}:`, error);
        return false;
    }
}
