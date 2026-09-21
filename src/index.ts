import pino from 'pino';
import { MusicBot } from './bot.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL });
const bot = new MusicBot(config, logger);
let stopping = false;

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'Shutting down');
  await bot.stop();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await bot.start();
} catch (error) {
  logger.fatal({ error }, 'Failed to start');
  process.exitCode = 1;
}
