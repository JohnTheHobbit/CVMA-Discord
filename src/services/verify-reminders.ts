import { Client, EmbedBuilder, Guild, TextChannel } from 'discord.js';
import { config } from '../config';
import {
  getUnverifiedMembersPendingKick,
  getUnverifiedMembersPendingReminder,
  markMemberKicked,
  markVerifyReminderSent,
  upsertUnverifiedMember,
} from './database';
import logger from '../utils/logger';

const VERIFIED_ROLE = 'Verified';

// ─── Seed ────────────────────────────────────────────────────────────────────

/** On bot ready, insert any existing unverified members so they start receiving reminders. */
export async function seedUnverifiedMembers(client: Client): Promise<void> {
  const guild = client.guilds.cache.get(config.discord.guildId);
  if (!guild) return;

  await guild.members.fetch();

  let seeded = 0;
  for (const [, member] of guild.members.cache) {
    if (member.user.bot) continue;
    const isVerified = member.roles.cache.some((r) => r.name === VERIFIED_ROLE);
    if (!isVerified) {
      const joinedAt = member.joinedAt?.toISOString() ?? new Date().toISOString();
      upsertUnverifiedMember(member.id, joinedAt);
      seeded++;
    }
  }

  logger.info(`Seeded ${seeded} existing unverified members into tracking table`);
}

// ─── Cron handler ────────────────────────────────────────────────────────────

export async function checkAndSendVerifyReminders(client: Client): Promise<void> {
  const guild = client.guilds.cache.get(config.discord.guildId);
  if (!guild) return;

  const { firstReminderDays, secondReminderDays, kickAfterDays } = config.verifyReminders;

  // ── Reminder 1 ──
  const firstPending = getUnverifiedMembersPendingReminder('reminder_1_sent', firstReminderDays);
  for (const row of firstPending) {
    await sendDm(client, row.discord_id, 'reminder_1_sent', buildReminder1Dm());
  }

  // ── Reminder 2 ──
  const secondPending = getUnverifiedMembersPendingReminder('reminder_2_sent', secondReminderDays);
  for (const row of secondPending) {
    await sendDm(client, row.discord_id, 'reminder_2_sent', buildReminder2Dm());
  }

  // ── Auto-kick ──
  const kickPending = getUnverifiedMembersPendingKick(kickAfterDays);
  const kicked: string[] = [];

  for (const row of kickPending) {
    try {
      const member = await guild.members.fetch(row.discord_id).catch(() => null);
      if (member) {
        await member.kick('Did not verify within the required timeframe');
        logger.info(`Kicked unverified member ${member.user.tag} (joined ${row.joined_at})`);
        kicked.push(member.user.tag);
      }
    } catch (err) {
      logger.warn(`Failed to kick ${row.discord_id}: ${err}`);
    }
    markMemberKicked(row.discord_id);
  }

  if (kicked.length > 0) {
    await postKickLog(guild, kicked);
  }
}

// ─── DM helpers ──────────────────────────────────────────────────────────────

async function sendDm(
  client: Client,
  discordId: string,
  field: 'reminder_1_sent' | 'reminder_2_sent',
  text: string,
): Promise<void> {
  try {
    const user = await client.users.fetch(discordId);
    await user.send(text);
    logger.info(`Sent verify ${field} DM to ${user.tag}`);
  } catch {
    logger.debug(`Could not DM ${discordId} (DMs may be disabled)`);
  }
  markVerifyReminderSent(discordId, field);
}

function buildReminder1Dm(): string {
  return (
    'Just a reminder — your CVMA Minnesota Discord account isn\'t verified yet. ' +
    'Until you verify, you can only see `#rules` and `#verify`. ' +
    'Head to the **#verify** channel and click the **Verify** button, ' +
    'then enter the email address in your 201 file to get full access. ' +
    'Questions? Contact your chain of command.'
  );
}

function buildReminder2Dm(): string {
  return (
    'This is your final reminder that your CVMA Minnesota Discord account has not been verified. ' +
    '**If you don\'t verify within 7 days, you will be removed from the server.** ' +
    'Head to the **#verify** channel and click the **Verify** button, ' +
    'or contact your chain of command if you need help.'
  );
}

// ─── Kick log ────────────────────────────────────────────────────────────────

async function postKickLog(guild: Guild, kickedTags: string[]): Promise<void> {
  const logChannel = guild.channels.cache.find(
    (c) => c.name === 'seb-bot-log' && c.isTextBased(),
  ) as TextChannel | undefined;

  if (!logChannel) return;

  const lines = kickedTags.map((tag) => `• ${tag}`).join('\n');
  await logChannel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle('Unverified Members Removed')
        .setDescription(
          `${kickedTags.length} member(s) were removed for not verifying within the required timeframe:\n\n${lines}`,
        )
        .setColor(0xcc0000)
        .setTimestamp(),
    ],
  });
}
