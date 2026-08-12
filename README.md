# Luxe

Luxe is a Discord community bot using slash commands, interactions, Components V2, and local persistent JSON storage.

## Hosting

Luxe is configured for multi-guild hosting by default.

Required environment variables:

- `DISCORD_TOKEN` — Discord bot token
- `CLIENT_ID` — Discord application/client ID

Optional:

- `MULTI_GUILD=false` — use single-guild command registration instead of global registration
- `GUILD_ID` — required only when `MULTI_GUILD=false`
- `OWNER_IDS` — comma-separated bot owner IDs
- `NODE_ENV=production`
- `LOG_LEVEL=info`

Start command:

```bash
npm install
npm start
```

Node.js 18+ is supported; Node 24 is recommended for the current development environment.

## Persistent storage

Luxe stores persistent data in `data/storage.json`. Keep the host's application storage/volume persistent so restarts and redeployments do not erase guild configuration, giveaways, tickets, and other stored data.

The `data/` and `logs/` directories are intentionally ignored by Git.

## PostgreSQL

PostgreSQL is not required. Luxe uses local persistent storage through the built-in storage wrapper.

## Secrets

Never commit `.env` or Discord tokens to GitHub. Configure secrets through the hosting provider's environment-variable settings.
