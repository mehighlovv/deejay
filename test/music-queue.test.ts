import { describe, expect, it } from 'vitest';
import { assertSameVoiceChannel } from '../src/authorization.js';
import { MusicQueue, type MusicTrack } from '../src/music-queue.js';

function track(title: string): MusicTrack {
  return {
    encoded: title,
    identifier: title,
    title,
    author: 'Artist',
    uri: `https://open.spotify.com/track/${title}`,
    artworkUrl: null,
    lengthMs: 180_000,
    sourceName: 'spotify',
    requestedBy: 'user',
  };
}

describe('MusicQueue', () => {
  it('plays enqueued tracks in order', () => {
    const queue = new MusicQueue();
    queue.enqueue(track('one'), track('two'), track('three'));
    expect(queue.start()?.title).toBe('one');
    expect(queue.finish()?.title).toBe('two');
    expect(queue.skip()?.title).toBe('three');
    expect(queue.finish()).toBeNull();
  });

  it('loops the current track', () => {
    const queue = new MusicQueue();
    queue.enqueue(track('one'), track('two'));
    queue.start();
    queue.loopMode = 'track';
    expect(queue.finish()?.title).toBe('one');
    expect(queue.upcoming.map((item) => item.title)).toEqual(['two']);
  });

  it('rotates tracks in queue loop mode', () => {
    const queue = new MusicQueue();
    queue.enqueue(track('one'), track('two'));
    queue.start();
    queue.loopMode = 'queue';
    expect(queue.finish()?.title).toBe('two');
    expect(queue.finish()?.title).toBe('one');
  });

  it('shuffles only upcoming tracks without losing entries', () => {
    const queue = new MusicQueue();
    queue.enqueue(track('one'), track('two'), track('three'));
    queue.start();
    queue.shuffle(() => 0);
    expect(queue.current?.title).toBe('one');
    expect(queue.upcoming.map((item) => item.title).sort()).toEqual(['three', 'two']);
  });
});

describe('voice authorization', () => {
  it('allows members in the player channel', () => {
    expect(() => assertSameVoiceChannel('voice-a', 'voice-a')).not.toThrow();
  });

  it('rejects members in another channel', () => {
    expect(() => assertSameVoiceChannel('voice-a', 'voice-b')).toThrow(
      'Join the voice channel where the bot is playing.',
    );
  });
});
