import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('loads safe defaults with only required Discord credentials', () => {
    const config = loadConfig({
      DISCORD_TOKEN: 'test-token',
      DISCORD_CLIENT_ID: 'test-client',
      SPOTIFY_CLIENT_ID: 'test-spotify-client',
      SPOTIFY_CLIENT_SECRET: 'test-spotify-secret',
    });
    expect(config.LAVALINK_HOST).toBe('localhost');
    expect(config.LAVALINK_PORT).toBe(2333);
    expect(config.DATABASE_PATH).toBe('./data/deejay.db');
  });

  it('reports missing required settings', () => {
    expect(() => loadConfig({})).toThrow('DISCORD_TOKEN');
  });
});
