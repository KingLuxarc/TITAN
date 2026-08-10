import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'storage.json');

class MemoryStorage {
    constructor() {
        this.data = new Map();
        this.expirationTimes = new Map();
        this.loaded = false;
        this.writeQueue = Promise.resolve();
    }

    async initialize() {
        if (this.loaded) return;
        await fs.mkdir(DATA_DIR, { recursive: true });
        try {
            const raw = await fs.readFile(DATA_FILE, 'utf8');
            const saved = JSON.parse(raw);
            for (const [key, value] of Object.entries(saved.data || {})) this.data.set(key, value);
            for (const [key, value] of Object.entries(saved.expirationTimes || {})) this.expirationTimes.set(key, value);
            this.cleanupExpired();
        } catch (error) {
            if (error.code !== 'ENOENT') logger.warn(`Could not load local storage: ${error.message}`);
        }
        this.loaded = true;
    }

    async persist() {
        const payload = {
            data: Object.fromEntries(this.data),
            expirationTimes: Object.fromEntries(this.expirationTimes),
        };
        this.writeQueue = this.writeQueue.then(async () => {
            const tempFile = `${DATA_FILE}.tmp`;
            await fs.writeFile(tempFile, JSON.stringify(payload, null, 2), 'utf8');
            await fs.rename(tempFile, DATA_FILE);
        }).catch(error => logger.error(`Could not save local storage: ${error.message}`));
        return this.writeQueue;
    }

    cleanupExpired() {
        const now = Date.now();
        for (const [key, expirationTime] of this.expirationTimes) {
            if (now > expirationTime) {
                this.data.delete(key);
                this.expirationTimes.delete(key);
            }
        }
    }

    async get(key, defaultValue = null) {
        const expirationTime = this.expirationTimes.get(key);
        if (expirationTime && Date.now() > expirationTime) {
            this.data.delete(key);
            this.expirationTimes.delete(key);
            await this.persist();
            return defaultValue;
        }
        const value = this.data.get(key);
        return value !== undefined ? value : defaultValue;
    }

    async set(key, value, ttl = null) {
        this.data.set(key, value);
        if (ttl && ttl > 0) this.expirationTimes.set(key, Date.now() + (ttl * 1000));
        else this.expirationTimes.delete(key);
        await this.persist();
        return true;
    }

    async delete(key) {
        this.data.delete(key);
        this.expirationTimes.delete(key);
        await this.persist();
        return true;
    }

    async list(prefix) {
        this.cleanupExpired();
        return [...this.data.keys()].filter(key => key.startsWith(prefix));
    }

    async exists(key) {
        const value = await this.get(key, undefined);
        return value !== undefined;
    }

    async increment(key, amount = 1) {
        const current = await this.get(key, 0);
        const newValue = current + amount;
        await this.set(key, newValue);
        return newValue;
    }

    async decrement(key, amount = 1) {
        const current = await this.get(key, 0);
        const newValue = current - amount;
        await this.set(key, newValue);
        return newValue;
    }

    async clear() {
        this.data.clear();
        this.expirationTimes.clear();
        await this.persist();
        return true;
    }
}

export { MemoryStorage };