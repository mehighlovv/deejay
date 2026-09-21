import { REST, Routes } from 'discord.js';
import { commandData } from './command-data.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const rest = new REST().setToken(config.DISCORD_TOKEN);
const route = config.DISCORD_GUILD_ID
  ? Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_GUILD_ID)
  : Routes.applicationCommands(config.DISCORD_CLIENT_ID);

await rest.put(route, { body: commandData });
console.log(
  `Registered ${commandData.length} commands ${config.DISCORD_GUILD_ID ? 'for the development server' : 'globally'}.`,
);
