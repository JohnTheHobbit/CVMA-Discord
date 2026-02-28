import { Client } from 'discord.js';
import cron from 'node-cron';
import { config } from '../config';
import { syncRoles, postSyncSummary } from '../services/role-sync';
import logger from '../utils/logger';

export async function onReady(client: Client<true>): Promise<void> {
  logger.info(`Bot logged in as ${client.user.tag}`);
  logger.info(`Serving guild: ${config.discord.guildId}`);

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
}
