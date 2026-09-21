import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { StoredTrack } from './music-queue.js';

export interface PlaylistSummary {
  id: number;
  name: string;
  trackCount: number;
}

interface PlaylistRow {
  id: number;
  name: string;
}

interface TrackRow {
  identifier: string;
  title: string;
  author: string;
  uri: string | null;
  artwork_url: string | null;
  length_ms: number;
  source_name: string;
}

export class PlaylistRepository {
  private readonly database: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS playlists (
        id INTEGER PRIMARY KEY,
        guild_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        name TEXT NOT NULL COLLATE NOCASE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (guild_id, owner_id, name)
      );
      CREATE TABLE IF NOT EXISTS playlist_tracks (
        id INTEGER PRIMARY KEY,
        playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        identifier TEXT NOT NULL,
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        uri TEXT,
        artwork_url TEXT,
        length_ms INTEGER NOT NULL,
        source_name TEXT NOT NULL,
        UNIQUE (playlist_id, position)
      );
    `);
  }

  close(): void {
    this.database.close();
  }

  create(guildId: string, ownerId: string, name: string): void {
    this.database
      .prepare('INSERT INTO playlists (guild_id, owner_id, name) VALUES (?, ?, ?)')
      .run(guildId, ownerId, name);
  }

  delete(guildId: string, ownerId: string, name: string): boolean {
    const result = this.database
      .prepare('DELETE FROM playlists WHERE guild_id = ? AND owner_id = ? AND name = ?')
      .run(guildId, ownerId, name);
    return result.changes > 0;
  }

  list(guildId: string, ownerId: string): PlaylistSummary[] {
    return this.database
      .prepare(`
        SELECT p.id, p.name, COUNT(t.id) AS trackCount
        FROM playlists p
        LEFT JOIN playlist_tracks t ON t.playlist_id = p.id
        WHERE p.guild_id = ? AND p.owner_id = ?
        GROUP BY p.id
        ORDER BY p.name COLLATE NOCASE
      `)
      .all(guildId, ownerId) as unknown as PlaylistSummary[];
  }

  addTrack(guildId: string, ownerId: string, name: string, track: StoredTrack): number {
    const playlist = this.find(guildId, ownerId, name);
    if (!playlist) throw new Error(`Playlist "${name}" does not exist.`);

    const position = Number(
      (
        this.database
          .prepare(
            'SELECT COALESCE(MAX(position), 0) + 1 AS position FROM playlist_tracks WHERE playlist_id = ?',
          )
          .get(playlist.id) as { position: number }
      ).position,
    );

    this.database
      .prepare(`
        INSERT INTO playlist_tracks (
          playlist_id, position, identifier, title, author, uri,
          artwork_url, length_ms, source_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        playlist.id,
        position,
        track.identifier,
        track.title,
        track.author,
        track.uri,
        track.artworkUrl,
        track.lengthMs,
        track.sourceName,
      );
    return position;
  }

  removeTrack(guildId: string, ownerId: string, name: string, position: number): boolean {
    const playlist = this.find(guildId, ownerId, name);
    if (!playlist) throw new Error(`Playlist "${name}" does not exist.`);

    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = this.database
        .prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND position = ?')
        .run(playlist.id, position);
      if (result.changes > 0) {
        this.database
          .prepare(
            'UPDATE playlist_tracks SET position = position - 1 WHERE playlist_id = ? AND position > ?',
          )
          .run(playlist.id, position);
      }
      this.database.exec('COMMIT');
      return result.changes > 0;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  getTracks(guildId: string, ownerId: string, name: string): StoredTrack[] {
    const playlist = this.find(guildId, ownerId, name);
    if (!playlist) throw new Error(`Playlist "${name}" does not exist.`);
    const rows = this.database
      .prepare(`
        SELECT identifier, title, author, uri, artwork_url, length_ms, source_name
        FROM playlist_tracks
        WHERE playlist_id = ?
        ORDER BY position
      `)
      .all(playlist.id) as unknown as TrackRow[];

    return rows.map((row) => ({
      identifier: row.identifier,
      title: row.title,
      author: row.author,
      uri: row.uri,
      artworkUrl: row.artwork_url,
      lengthMs: row.length_ms,
      sourceName: row.source_name,
    }));
  }

  private find(guildId: string, ownerId: string, name: string): PlaylistRow | undefined {
    return this.database
      .prepare(
        'SELECT id, name FROM playlists WHERE guild_id = ? AND owner_id = ? AND name = ?',
      )
      .get(guildId, ownerId, name) as PlaylistRow | undefined;
  }
}
