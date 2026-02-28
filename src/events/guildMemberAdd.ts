import { GuildMember, TextChannel, EmbedBuilder } from 'discord.js';
import logger from '../utils/logger';

export async function onGuildMemberAdd(member: GuildMember): Promise<void> {
  logger.info(`New member joined: ${member.user.tag}`);

  // Find the #welcome channel
  const welcomeChannel = member.guild.channels.cache.find(
    (c) => c.name === 'welcome' && c.isTextBased(),
  ) as TextChannel | undefined;

  if (!welcomeChannel) {
    logger.warn('Could not find #welcome channel to greet new member');
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('Welcome to CVMA Minnesota!')
    .setDescription(
      `Welcome, ${member.toString()}!\n\n` +
      'To get access to your chapter channels and state-level channels, ' +
      'please head to the **#verify** channel and use the `/verify` command ' +
      'with the email address associated with your CVMA membership.\n\n' +
      'Example: `/verify email:your.email@example.com`\n\n' +
      'If you need help, contact the State Rep.',
    )
    .setColor(0x2e8b57)
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();

  await welcomeChannel.send({ embeds: [embed] });
}
