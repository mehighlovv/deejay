import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Message,
} from 'discord.js';
import type { GuildPlayerSession } from './player-service.js';

function duration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function buildNowPlaying(session: GuildPlayerSession) {
  const track = session.queue.current;
  if (!track) throw new Error('Cannot render a player without a current track.');

  const position = Math.min(session.player.position, track.lengthMs);
  const progress = track.lengthMs
    ? `${duration(position)} / ${duration(track.lengthMs)}`
    : 'Live';
  const embed = new EmbedBuilder()
    .setColor(0x1db954)
    .setTitle(track.title)
    .setURL(track.uri ?? null)
    .setAuthor({ name: 'Now playing' })
    .setDescription(`**${track.author}**\n${progress}`)
    .addFields(
      { name: 'Requested by', value: `<@${track.requestedBy}>`, inline: true },
      { name: 'Up next', value: String(session.queue.upcoming.length), inline: true },
      { name: 'Loop', value: session.queue.loopMode, inline: true },
    )
    .setFooter({ text: session.player.paused ? 'Paused' : 'Playing' });
  if (track.artworkUrl) embed.setThumbnail(track.artworkUrl);

  const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('music:pause')
      .setLabel(session.player.paused ? 'Resume' : 'Pause')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('music:skip').setLabel('Skip').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music:shuffle')
      .setLabel('Shuffle')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music:loop')
      .setLabel(`Loop: ${session.queue.loopMode}`)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('music:stop').setLabel('Stop').setStyle(ButtonStyle.Danger),
  );
  return { embeds: [embed], components: [controls] };
}

export function buildQueue(session: GuildPlayerSession) {
  const current = session.queue.current;
  const upcoming = session.queue.upcoming
    .slice(0, 10)
    .map((track, index) => `${index + 1}. **${track.title}** — ${track.author}`)
    .join('\n');
  const extra = Math.max(0, session.queue.upcoming.length - 10);
  return new EmbedBuilder()
    .setColor(0x1db954)
    .setTitle('Music queue')
    .setDescription(
      [
        current ? `Now: **${current.title}** — ${current.author}` : 'Nothing playing.',
        upcoming || 'No upcoming songs.',
        extra ? `…and ${extra} more` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    )
    .setFooter({ text: `Loop: ${session.queue.loopMode}` });
}

export class PanelController {
  private readonly messages = new Map<string, Message>();

  set(guildId: string, message: Message): void {
    this.messages.set(guildId, message);
  }

  async update(guildId: string, session: GuildPlayerSession | null): Promise<void> {
    const message = this.messages.get(guildId);
    if (!message) return;
    try {
      if (session) {
        await message.edit(buildNowPlaying(session));
      } else {
        await message.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(0x5865f2)
              .setTitle('Playback finished')
              .setDescription('The queue is empty and the bot left the voice channel.'),
          ],
          components: [],
        });
        this.messages.delete(guildId);
      }
    } catch {
      this.messages.delete(guildId);
    }
  }
}
