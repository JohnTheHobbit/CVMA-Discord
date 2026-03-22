import { Client, EmbedBuilder } from 'discord.js';
import { getEventsNeedingReminder, getRsvps, markReminderSent } from './database';
import { EVENT_EMBED_COLOR } from '../utils/constants';
import logger from '../utils/logger';

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Chicago',
    timeZoneName: 'short',
  });
}

export async function checkAndSendReminders(client: Client): Promise<void> {
  for (const type of ['1d', '1h'] as const) {
    const events = getEventsNeedingReminder(type);
    const label = type === '1d' ? '24 hours' : '1 hour';

    for (const event of events) {
      const rsvps = getRsvps(event.id).filter(
        (r) => r.status === 'going' || r.status === 'maybe',
      );

      if (rsvps.length === 0) {
        markReminderSent(event.id, type);
        continue;
      }

      const embed = new EmbedBuilder()
        .setTitle(`Reminder: ${event.title}`)
        .setDescription(
          `This event starts in **${label}**!\n\n` +
          `**Date:** ${formatDate(event.event_date)}\n` +
          (event.location ? `**Location:** ${event.location}\n` : '') +
          (event.description ? `\n${event.description}` : ''),
        )
        .setColor(EVENT_EMBED_COLOR)
        .setFooter({ text: `Event ID: ${event.id.slice(0, 8)}` });

      let sent = 0;
      let failed = 0;

      for (const rsvp of rsvps) {
        try {
          const user = await client.users.fetch(rsvp.user_id);
          await user.send({ embeds: [embed] });
          sent++;
        } catch {
          failed++;
          logger.debug(`Could not DM reminder to user ${rsvp.user_id} (DMs may be disabled)`);
        }
      }

      markReminderSent(event.id, type);
      logger.info(
        `Sent ${type} reminders for "${event.title}" [${event.id.slice(0, 8)}]: ${sent} sent, ${failed} failed`,
      );
    }
  }
}
