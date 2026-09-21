# deejay

A TypeScript Discord music bot with YouTube search, Lavalink playback,
per-server queues, interactive controls, loop/shuffle support, and
SQLite-backed playlists.

## Requirements

- Node.js 24 or newer (the bot uses the built-in `node:sqlite` module)
- Docker with Compose
- A Discord application and bot token

## Setup

1. In the Discord Developer Portal, create an application and bot.
2. Install it in your server with the `bot` and `applications.commands` scopes.
   Grant View Channels, Send Messages, Embed Links, Connect, and Speak.
3. Copy `.env.example` to `.env` and fill in the Discord values.
   Keep `DISCORD_GUILD_ID` while developing for immediate command updates;
   remove it before registering commands globally.
4. Install dependencies and start Lavalink:

   ```sh
   npm install
   docker compose up -d
   ```

5. Register slash commands, then start the bot:

   ```sh
   npm run commands
   npm run dev
   ```

Production builds use `npm run build` followed by `npm start`.

## Commands

- `/play song:<name>` — play the first YouTube result or append it to the queue
- `/skip`, `/pause`, `/resume`, `/shuffle`
- `/loop mode:<off|song|queue>`
- `/queue`, `/nowplaying`
- `/playlist create name:<name>`
- `/playlist add name:<name> song:<name>`
- `/playlist remove name:<name> position:<number>`
- `/playlist list`, `/playlist show`, `/playlist play`, `/playlist delete`

The now-playing panel includes Pause/Resume, Skip, Shuffle, Loop, and Stop
buttons. Playback controls require the user to be in the bot's voice channel.
Queues are transient and scoped to each Discord server. Playlists are owned by
the creating user within a server and persist in `data/deejay.db`.

## Development

```sh
npm run check
npm run lint
npm test
```

Configuration is validated at startup. The custom Lavalink image installs
yt-dlp and downloads the pinned LavaSrc plugin on first launch. Rebuild the
image periodically to pick up yt-dlp updates.

## Legal

- [Terms of Service](TERMS_OF_SERVICE.md)
- [Privacy Policy](PRIVACY_POLICY.md)
