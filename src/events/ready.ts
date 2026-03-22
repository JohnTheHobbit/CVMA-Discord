import { Client } from 'discord.js';
import cron from 'node-cron';
import { config } from '../config';
import { syncRoles, postSyncSummary } from '../services/role-sync';
import { initDatabase } from '../services/database';
import { checkAndSendReminders } from '../services/event-reminders';
import { seedUnverifiedMembers, checkAndSendVerifyReminders } from '../services/verify-reminders';
import logger from '../utils/logger';

export async function onReady(client: Client<true>): Promise<void> {
  logger.info(`Bot logged in as ${client.user.tag}`);
  logger.info(`Serving guild: ${config.discord.guildId}`);

  // Initialize SQLite database
  initDatabase();

  // Seed existing unverified members into tracking table
  await seedUnverifiedMembers(client);

  // Schedule role sync
  cron.schedule(config.syncCron, async () => {
    logger.info('Scheduled role sync triggered');
    try {
      const guild = client.guilds.cache.get(config.discord.guildId);
      if (!guild) {
        logger.error('Guild not found for scheduled sync');
        return;
      }
      const changes = await syncRoles(guild);
      await postSyncSummary(guild, changes);
    } catch (err) {
      logger.error(`Scheduled role sync failed: ${err}`);
    }
  });

  logger.info(`Role sync scheduled: ${config.syncCron}`);

  // Schedule event reminders
  cron.schedule(config.reminderCron, async () => {
    try {
      await checkAndSendReminders(client);
    } catch (err) {
      logger.error(`Event reminder check failed: ${err}`);
    }
  });

  logger.info(`Event reminders scheduled: ${config.reminderCron}`);

  // Schedule verification reminder checks and auto-kick
  cron.schedule(config.verifyReminders.checkCron, async () => {
    try {
      await checkAndSendVerifyReminders(client);
    } catch (err) {
      logger.error(`Verify reminder check failed: ${err}`);
    }
  });

  logger.info(`Verify reminders scheduled: ${config.verifyReminders.checkCron}`);
}
