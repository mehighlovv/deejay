import { SlashCommandBuilder, type SlashCommandStringOption } from 'discord.js';

const playlistName = (option: SlashCommandStringOption): SlashCommandStringOption =>
  option
    .setName('name')
    .setDescription('Playlist name')
    .setRequired(true)
    .setMaxLength(50);

export const commandData = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a Spotify song or add it to the queue')
    .addStringOption((option) =>
      option
        .setName('song')
        .setDescription('Song name and artist')
        .setRequired(true)
        .setMaxLength(200),
    ),
  new SlashCommandBuilder().setName('skip').setDescription('Skip the current song'),
  new SlashCommandBuilder().setName('pause').setDescription('Pause the current song'),
  new SlashCommandBuilder().setName('resume').setDescription('Resume the current song'),
  new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Change loop mode')
    .addStringOption((option) =>
      option
        .setName('mode')
        .setDescription('What to loop')
        .setRequired(true)
        .addChoices(
          { name: 'Off', value: 'off' },
          { name: 'Current song', value: 'track' },
          { name: 'Entire queue', value: 'queue' },
        ),
    ),
  new SlashCommandBuilder().setName('shuffle').setDescription('Shuffle the upcoming queue'),
  new SlashCommandBuilder().setName('queue').setDescription('Show the current queue'),
  new SlashCommandBuilder().setName('nowplaying').setDescription('Show the player controls'),
  new SlashCommandBuilder()
    .setName('playlist')
    .setDescription('Manage your saved playlists')
    .addSubcommand((command) =>
      command.setName('create').setDescription('Create a playlist').addStringOption(playlistName),
    )
    .addSubcommand((command) =>
      command
        .setName('add')
        .setDescription('Add a Spotify song to a playlist')
        .addStringOption(playlistName)
        .addStringOption((option) =>
          option
            .setName('song')
            .setDescription('Song name and artist')
            .setRequired(true)
            .setMaxLength(200),
        ),
    )
    .addSubcommand((command) =>
      command
        .setName('remove')
        .setDescription('Remove a song by its position')
        .addStringOption(playlistName)
        .addIntegerOption((option) =>
          option
            .setName('position')
            .setDescription('Song position')
            .setRequired(true)
            .setMinValue(1),
        ),
    )
    .addSubcommand((command) =>
      command.setName('delete').setDescription('Delete a playlist').addStringOption(playlistName),
    )
    .addSubcommand((command) => command.setName('list').setDescription('List your playlists'))
    .addSubcommand((command) =>
      command.setName('show').setDescription('Show songs in a playlist').addStringOption(playlistName),
    )
    .addSubcommand((command) =>
      command.setName('play').setDescription('Add a playlist to the queue').addStringOption(playlistName),
    ),
].map((command) => command.toJSON());
