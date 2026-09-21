export type LoopMode = 'off' | 'track' | 'queue';

export interface MusicTrack {
  encoded: string;
  identifier: string;
  title: string;
  author: string;
  uri: string | null;
  artworkUrl: string | null;
  lengthMs: number;
  sourceName: string;
  requestedBy: string;
}

export type StoredTrack = Omit<MusicTrack, 'encoded' | 'requestedBy'>;

export class MusicQueue {
  public current: MusicTrack | null = null;
  public readonly upcoming: MusicTrack[] = [];
  public loopMode: LoopMode = 'off';

  enqueue(...tracks: MusicTrack[]): void {
    this.upcoming.push(...tracks);
  }

  start(): MusicTrack | null {
    if (!this.current) this.current = this.upcoming.shift() ?? null;
    return this.current;
  }

  finish(): MusicTrack | null {
    if (!this.current) return this.start();

    if (this.loopMode === 'track') return this.current;
    if (this.loopMode === 'queue') this.upcoming.push(this.current);

    this.current = this.upcoming.shift() ?? null;
    return this.current;
  }

  skip(): MusicTrack | null {
    this.current = this.upcoming.shift() ?? null;
    return this.current;
  }

  shuffle(random: () => number = Math.random): void {
    for (let index = this.upcoming.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      [this.upcoming[index], this.upcoming[other]] = [
        this.upcoming[other]!,
        this.upcoming[index]!,
      ];
    }
  }

  clear(): void {
    this.current = null;
    this.upcoming.splice(0);
    this.loopMode = 'off';
  }
}
