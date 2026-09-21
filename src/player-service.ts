import {
  LoadType,
  type Player,
  type Shoukaku,
  type Track,
} from 'shoukaku';
import {
  MusicQueue,
  type LoopMode,
  type MusicTrack,
  type StoredTrack,
} from './music-queue.js';

export interface GuildPlayerSession {
  guildId: string;
  voiceChannelId: string;
  textChannelId: string;
  player: Player;
  queue: MusicQueue;
}

type ChangeHandler = (guildId: string, session: GuildPlayerSession | null) => Promise<void>;

export class PlayerService {
  private readonly sessions = new Map<string, GuildPlayerSession>();

  constructor(
    private readonly lavalink: Shoukaku,
    private readonly onChange: ChangeHandler,
  ) {}

  get(guildId: string): GuildPlayerSession | undefined {
    return this.sessions.get(guildId);
  }

  async search(query: string, requestedBy: string): Promise<MusicTrack> {
    const node = this.lavalink.getIdealNode();
    if (!node) throw new Error('The audio server is not ready. Try again shortly.');

    const result = await node.rest.resolve(`spsearch:${query}`);
    if (!result || result.loadType === LoadType.EMPTY) {
      throw new Error(`No Spotify result found for "${query}".`);
    }
    if (result.loadType === LoadType.ERROR) throw new Error(result.data.message);

    const track =
      result.loadType === LoadType.TRACK
        ? result.data
        : result.loadType === LoadType.PLAYLIST
          ? result.data.tracks[0]
          : result.data[0];
    if (!track) throw new Error(`No Spotify result found for "${query}".`);
    return this.toMusicTrack(track, requestedBy);
  }

  async resolveStored(track: StoredTrack, requestedBy: string): Promise<MusicTrack> {
    const node = this.lavalink.getIdealNode();
    if (!node) throw new Error('The audio server is not ready. Try again shortly.');
    const identifier = track.uri ?? `spsearch:${track.title} ${track.author}`;
    const result = await node.rest.resolve(identifier);
    if (!result || result.loadType === LoadType.EMPTY || result.loadType === LoadType.ERROR) {
      throw new Error(`Could not resolve "${track.title}" for playback.`);
    }
    const resolved =
      result.loadType === LoadType.TRACK
        ? result.data
        : result.loadType === LoadType.PLAYLIST
          ? result.data.tracks[0]
          : result.data[0];
    if (!resolved) throw new Error(`Could not resolve "${track.title}" for playback.`);
    return this.toMusicTrack(resolved, requestedBy);
  }

  async enqueue(options: {
    guildId: string;
    voiceChannelId: string;
    textChannelId: string;
    shardId: number;
    tracks: MusicTrack[];
  }): Promise<GuildPlayerSession> {
    let session = this.sessions.get(options.guildId);
    if (!session) {
      const player = await this.lavalink.joinVoiceChannel({
        guildId: options.guildId,
        channelId: options.voiceChannelId,
        shardId: options.shardId,
        deaf: true,
      });
      session = {
        guildId: options.guildId,
        voiceChannelId: options.voiceChannelId,
        textChannelId: options.textChannelId,
        player,
        queue: new MusicQueue(),
      };
      this.sessions.set(options.guildId, session);
      player.on('end', (event) => {
        if (event.reason !== 'replaced' && event.reason !== 'cleanup') {
          void this.handleFinished(options.guildId);
        }
      });
    }

    if (session.voiceChannelId !== options.voiceChannelId) {
      throw new Error('The bot is already playing in another voice channel.');
    }
    session.textChannelId = options.textChannelId;
    session.queue.enqueue(...options.tracks);
    if (!session.queue.current) {
      const first = session.queue.start();
      if (first) await this.play(session, first);
    }
    await this.changed(session);
    return session;
  }

  async setPaused(guildId: string, paused: boolean): Promise<void> {
    const session = this.requireSession(guildId);
    await session.player.setPaused(paused);
    await this.changed(session);
  }

  async togglePaused(guildId: string): Promise<boolean> {
    const session = this.requireSession(guildId);
    const paused = !session.player.paused;
    await session.player.setPaused(paused);
    await this.changed(session);
    return paused;
  }

  async skip(guildId: string): Promise<MusicTrack | null> {
    const session = this.requireSession(guildId);
    const next = session.queue.skip();
    if (next) {
      await this.play(session, next);
      await this.changed(session);
    } else {
      await session.player.stopTrack();
      await this.disconnect(guildId);
    }
    return next;
  }

  async setLoop(guildId: string, mode: LoopMode): Promise<void> {
    const session = this.requireSession(guildId);
    session.queue.loopMode = mode;
    await this.changed(session);
  }

  async cycleLoop(guildId: string): Promise<LoopMode> {
    const session = this.requireSession(guildId);
    const modes: LoopMode[] = ['off', 'track', 'queue'];
    const next = modes[(modes.indexOf(session.queue.loopMode) + 1) % modes.length]!;
    session.queue.loopMode = next;
    await this.changed(session);
    return next;
  }

  async shuffle(guildId: string): Promise<void> {
    const session = this.requireSession(guildId);
    session.queue.shuffle();
    await this.changed(session);
  }

  async disconnect(guildId: string): Promise<void> {
    const session = this.sessions.get(guildId);
    if (!session) return;
    session.queue.clear();
    this.sessions.delete(guildId);
    await this.lavalink.leaveVoiceChannel(guildId);
    await this.onChange(guildId, null);
  }

  private async handleFinished(guildId: string): Promise<void> {
    const session = this.sessions.get(guildId);
    if (!session) return;
    const next = session.queue.finish();
    if (!next) {
      await this.disconnect(guildId);
      return;
    }
    await this.play(session, next);
    await this.changed(session);
  }

  private async play(session: GuildPlayerSession, track: MusicTrack): Promise<void> {
    await session.player.playTrack({ track: { encoded: track.encoded } });
  }

  private requireSession(guildId: string): GuildPlayerSession {
    const session = this.sessions.get(guildId);
    if (!session?.queue.current) throw new Error('Nothing is playing.');
    return session;
  }

  private async changed(session: GuildPlayerSession): Promise<void> {
    await this.onChange(session.guildId, session);
  }

  private toMusicTrack(track: Track, requestedBy: string): MusicTrack {
    return {
      encoded: track.encoded,
      identifier: track.info.identifier,
      title: track.info.title,
      author: track.info.author,
      uri: track.info.uri ?? null,
      artworkUrl: track.info.artworkUrl ?? null,
      lengthMs: track.info.length,
      sourceName: track.info.sourceName,
      requestedBy,
    };
  }
}
