import { GuildMember } from 'discord.js';
import { markVerifyReminderSent, upsertUnverifiedMember } from '../services/database';
import logger from '../utils/logger';

const WELCOME_DM =
  'Welcome to **CVMA Minnesota** on Discord!\n\n' +
  'To access chapter channels and all server content, you\'ll need to verify your CVMA membership. ' +
  'Head to the **#verify** channel and click the **Verify** button, ' +
  'then enter the email address in your 201 file. ' +
  'If you need help, contact your chain of command.';

export async function onGuildMemberAdd(member: GuildMember): Promise<void> {
  logger.info(`New member joined: ${member.user.tag}`);

  if (member.user.bot) return;

  const joinedAt = member.joinedAt?.toISOString() ?? new Date().toISOString();
  upsertUnverifiedMember(member.id, joinedAt);

  try {
    await member.user.send(WELCOME_DM);
    markVerifyReminderSent(member.id, 'welcome_sent');
  } catch {
    // DMs disabled — mark as sent so the cron doesn't retry
    markVerifyReminderSent(member.id, 'welcome_sent');
    logger.debug(`Could not send welcome DM to ${member.user.tag} (DMs may be disabled)`);
  }
}
