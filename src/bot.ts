import {
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  GuildMember,
  MessageFlags,
  PermissionsBitField,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
} from 'discord.js';
import { Connectors, Shoukaku } from 'shoukaku';
import type { Logger } from 'pino';
import { assertSameVoiceChannel } from './authorization.js';
import type { Config } from './config.js';
import type { LoopMode, StoredTrack } from './music-queue.js';
import { PanelController, buildNowPlaying, buildQueue } from './ui.js';
import { PlayerService } from './player-service.js';
import { PlaylistRepository } from './playlist-repository.js';

export class MusicBot {
  public readonly client: Client;
  public readonly lavalink: Shoukaku;
  public readonly players: PlayerService;
  private readonly panels = new PanelController();
  private readonly playlists: PlaylistRepository;

  constructor(
    private readonly config: Config,
    private readonly logger: Logger,
  ) {
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
    });
    this.lavalink = new Shoukaku(
      new Connectors.DiscordJS(this.client),
      [
        {
          name: 'main',
          url: `${config.LAVALINK_HOST}:${config.LAVALINK_PORT}`,
          auth: config.LAVALINK_PASSWORD,
          secure: config.LAVALINK_SECURE,
        },
      ],
      { resume: true, reconnectTries: 5, moveOnDisconnect: true },
    );
    this.playlists = new PlaylistRepository(config.DATABASE_PATH);
    this.players = new PlayerService(this.lavalink, (guildId, session) =>
      this.panels.update(guildId, session),
    );
  }

  async start(): Promise<void> {
    this.client.once('ready', (client) => {
      this.logger.info({ user: client.user.tag }, 'Discord bot ready');
    });
    this.client.on('interactionCreate', (interaction) => {
      void this.handleInteraction(interaction);
    });
    this.lavalink.on('ready', (name) => this.logger.info({ node: name }, 'Lavalink ready'));
    this.lavalink.on('error', (name, error) =>
      this.logger.error({ node: name, error }, 'Lavalink error'),
    );
    await this.client.login(this.config.DISCORD_TOKEN);
  }

  async stop(): Promise<void> {
    await Promise.all([...this.client.guilds.cache.keys()].map((id) => this.players.disconnect(id)));
    this.playlists.close();
    await this.client.destroy();
  }

  private async handleInteraction(interaction: Interaction): Promise<void> {
    try {
      if (interaction.isChatInputCommand()) await this.handleCommand(interaction);
      else if (interaction.isButton() && interaction.customId.startsWith('music:')) {
        await this.handleButton(interaction);
      }
    } catch (error) {
      this.logger.warn({ error }, 'Interaction failed');
      const message = error instanceof Error ? error.message : 'Something went wrong.';
      if (interaction.isRepliable()) {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
        } else {
          await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
        }
      }
    }
  }

  private async handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inGuild()) throw new Error('Music commands can only be used in a server.');

    switch (interaction.commandName) {
      case 'play':
        await this.playSong(interaction);
        break;
      case 'skip':
        await this.control(interaction, async () => {
          const next = await this.players.skip(interaction.guildId);
          return next ? `Skipped. Now playing **${next.title}**.` : 'Skipped. The queue is empty.';
        });
        break;
      case 'pause':
        await this.control(interaction, async () => {
          await this.players.setPaused(interaction.guildId, true);
          return 'Paused.';
        });
        break;
      case 'resume':
        await this.control(interaction, async () => {
          await this.players.setPaused(interaction.guildId, false);
          return 'Resumed.';
        });
        break;
      case 'loop':
        await this.control(interaction, async () => {
          const mode = interaction.options.getString('mode', true) as LoopMode;
          await this.players.setLoop(interaction.guildId, mode);
          return `Loop mode set to **${mode}**.`;
        });
        break;
      case 'shuffle':
        await this.control(interaction, async () => {
          await this.players.shuffle(interaction.guildId);
          return 'Shuffled the upcoming queue.';
        });
        break;
      case 'queue': {
        const session = this.players.get(interaction.guildId);
        if (!session) throw new Error('Nothing is playing.');
        await interaction.reply({ embeds: [buildQueue(session)] });
        break;
      }
      case 'nowplaying': {
        const session = this.players.get(interaction.guildId);
        if (!session) throw new Error('Nothing is playing.');
        const message = await interaction.reply({ ...buildNowPlaying(session), fetchReply: true });
        this.panels.set(interaction.guildId, message);
        break;
      }
      case 'playlist':
        await this.handlePlaylist(interaction);
        break;
    }
  }

  private async playSong(interaction: ChatInputCommandInteraction): Promise<void> {
    const voiceChannelId = await this.requireVoice(interaction);
    await interaction.deferReply();
    const query = interaction.options.getString('song', true);
    const track = await this.players.search(query, interaction.user.id);
    const wasPlaying = Boolean(this.players.get(interaction.guildId!)?.queue.current);
    const session = await this.players.enqueue({
      guildId: interaction.guildId!,
      voiceChannelId,
      textChannelId: interaction.channelId,
      shardId: interaction.guild!.shardId,
      tracks: [track],
    });
    if (wasPlaying) {
      await interaction.editReply(`Added **${track.title}** by ${track.author} to the queue.`);
    } else {
      const message = await interaction.editReply(buildNowPlaying(session));
      this.panels.set(interaction.guildId!, message);
    }
  }

  private async handlePlaylist(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId!;
    const ownerId = interaction.user.id;
    const subcommand = interaction.options.getSubcommand();
    const name = interaction.options.getString('name');

    if (subcommand === 'create') {
      this.playlists.create(guildId, ownerId, name!);
      await interaction.reply({ content: `Created playlist **${name}**.`, flags: MessageFlags.Ephemeral });
      return;
    }
    if (subcommand === 'list') {
      const playlists = this.playlists.list(guildId, ownerId);
      const content = playlists.length
        ? playlists.map((playlist) => `**${playlist.name}** — ${playlist.trackCount} tracks`).join('\n')
        : 'You have no playlists.';
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
      return;
    }
    if (subcommand === 'delete') {
      if (!this.playlists.delete(guildId, ownerId, name!)) {
        throw new Error(`Playlist "${name}" does not exist.`);
      }
      await interaction.reply({ content: `Deleted playlist **${name}**.`, flags: MessageFlags.Ephemeral });
      return;
    }
    if (subcommand === 'remove') {
      const position = interaction.options.getInteger('position', true);
      if (!this.playlists.removeTrack(guildId, ownerId, name!, position)) {
        throw new Error(`Playlist "${name}" has no track at position ${position}.`);
      }
      await interaction.reply({ content: `Removed track ${position} from **${name}**.`, flags: MessageFlags.Ephemeral });
      return;
    }
    if (subcommand === 'show') {
      const tracks = this.playlists.getTracks(guildId, ownerId, name!);
      const description = tracks.length
        ? tracks.slice(0, 25).map((track, index) => `${index + 1}. **${track.title}** — ${track.author}`).join('\n')
        : 'This playlist is empty.';
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x1db954).setTitle(name).setDescription(description)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (subcommand === 'add') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const track = await this.players.search(interaction.options.getString('song', true), ownerId);
      const stored: StoredTrack = {
        identifier: track.identifier,
        title: track.title,
        author: track.author,
        uri: track.uri,
        artworkUrl: track.artworkUrl,
        lengthMs: track.lengthMs,
        sourceName: track.sourceName,
      };
      const position = this.playlists.addTrack(guildId, ownerId, name!, stored);
      await interaction.editReply(`Added **${track.title}** to **${name}** at position ${position}.`);
      return;
    }
    if (subcommand === 'play') {
      const voiceChannelId = await this.requireVoice(interaction);
      await interaction.deferReply();
      const storedTracks = this.playlists.getTracks(guildId, ownerId, name!);
      if (!storedTracks.length) throw new Error(`Playlist "${name}" is empty.`);
      const tracks = [];
      for (const stored of storedTracks) {
        tracks.push(await this.players.resolveStored(stored, ownerId));
      }
      const session = await this.players.enqueue({
        guildId,
        voiceChannelId,
        textChannelId: interaction.channelId,
        shardId: interaction.guild!.shardId,
        tracks,
      });
      const message = await interaction.editReply(buildNowPlaying(session));
      this.panels.set(guildId, message);
    }
  }

  private async control(
    interaction: ChatInputCommandInteraction,
    action: () => Promise<string>,
  ): Promise<void> {
    await this.requireSameVoice(interaction);
    const result = await action();
    await interaction.reply({ content: result, flags: MessageFlags.Ephemeral });
  }

  private async handleButton(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.inGuild()) throw new Error('This control is no longer active.');
    await this.requireSameVoice(interaction);
    await interaction.deferUpdate();
    const action = interaction.customId.slice('music:'.length);
    let status: string;
    switch (action) {
      case 'pause':
        status = (await this.players.togglePaused(interaction.guildId)) ? 'Paused.' : 'Resumed.';
        break;
      case 'skip': {
        const next = await this.players.skip(interaction.guildId);
        status = next ? `Skipped to **${next.title}**.` : 'Stopped; the queue is empty.';
        break;
      }
      case 'shuffle':
        await this.players.shuffle(interaction.guildId);
        status = 'Shuffled the queue.';
        break;
      case 'loop':
        status = `Loop mode: **${await this.players.cycleLoop(interaction.guildId)}**.`;
        break;
      case 'stop':
        await this.players.disconnect(interaction.guildId);
        status = 'Stopped playback and cleared the queue.';
        break;
      default:
        throw new Error('Unknown player control.');
    }
    await interaction.followUp({ content: status, flags: MessageFlags.Ephemeral });
  }

  private async requireVoice(interaction: ChatInputCommandInteraction): Promise<string> {
    const guild = interaction.guild;
    if (!guild) throw new Error('This command can only be used in a server.');
    const member =
      interaction.member instanceof GuildMember
        ? interaction.member
        : await guild.members.fetch(interaction.user.id);
    const channel = member.voice.channel;
    if (!channel) throw new Error('Join a voice channel first.');
    const me = guild.members.me;
    if (
      !me ||
      !channel.permissionsFor(me).has([
        PermissionsBitField.Flags.Connect,
        PermissionsBitField.Flags.Speak,
      ])
    ) {
      throw new Error('I need Connect and Speak permissions in your voice channel.');
    }
    const existing = this.players.get(guild.id);
    if (existing && existing.voiceChannelId !== channel.id) {
      throw new Error('Join the voice channel where the bot is playing.');
    }
    return channel.id;
  }

  private async requireSameVoice(
    interaction: ChatInputCommandInteraction | ButtonInteraction,
  ): Promise<void> {
    const session = interaction.guildId ? this.players.get(interaction.guildId) : undefined;
    if (!session) throw new Error('Nothing is playing.');
    const guild = interaction.guild;
    if (!guild) throw new Error('This control can only be used in a server.');
    const member =
      interaction.member instanceof GuildMember
        ? interaction.member
        : await guild.members.fetch(interaction.user.id);
    assertSameVoiceChannel(session.voiceChannelId, member.voice.channelId);
  }
}
