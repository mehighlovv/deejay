export function assertSameVoiceChannel(
  playerVoiceChannelId: string | undefined,
  memberVoiceChannelId: string | null,
): void {
  if (!playerVoiceChannelId) throw new Error('Nothing is playing.');
  if (memberVoiceChannelId !== playerVoiceChannelId) {
    throw new Error('Join the voice channel where the bot is playing.');
  }
}
