// Local-storage compatibility shim.
// PostgreSQL has been removed from this bot. This module remains temporarily
// so older utility imports continue to work during the cleanup.

export const pgDb = {
    pool: null,
    async connect() { return false; },
    isAvailable() { return false; },
    getLastFailure() {
        return { reason: 'LOCAL_STORAGE_ONLY', message: 'PostgreSQL is disabled.' };
    },
    async insertVerificationAudit() { return true; },
};
