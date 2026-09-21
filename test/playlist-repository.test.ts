import { describe, expect, it } from 'vitest';
import type { StoredTrack } from '../src/music-queue.js';
import { PlaylistRepository } from '../src/playlist-repository.js';

const first: StoredTrack = {
  identifier: 'first',
  title: 'First',
  author: 'Artist',
  uri: 'https://open.spotify.com/track/first',
  artworkUrl: null,
  lengthMs: 1000,
  sourceName: 'spotify',
};

describe('PlaylistRepository', () => {
  it('persists tracks in order and compacts positions after removal', () => {
    const repository = new PlaylistRepository(':memory:');
    repository.create('guild', 'owner', 'Favorites');
    repository.addTrack('guild', 'owner', 'Favorites', first);
    repository.addTrack('guild', 'owner', 'Favorites', { ...first, identifier: 'second', title: 'Second' });
    repository.addTrack('guild', 'owner', 'Favorites', { ...first, identifier: 'third', title: 'Third' });

    expect(repository.removeTrack('guild', 'owner', 'Favorites', 2)).toBe(true);
    expect(repository.getTracks('guild', 'owner', 'Favorites').map((track) => track.title)).toEqual([
      'First',
      'Third',
    ]);
    expect(repository.list('guild', 'owner')).toEqual([
      { id: 1, name: 'Favorites', trackCount: 2 },
    ]);
    repository.close();
  });

  it('isolates playlists by guild and owner', () => {
    const repository = new PlaylistRepository(':memory:');
    repository.create('guild-a', 'owner-a', 'Mix');
    expect(repository.list('guild-b', 'owner-a')).toEqual([]);
    expect(repository.list('guild-a', 'owner-b')).toEqual([]);
    repository.close();
  });
});
