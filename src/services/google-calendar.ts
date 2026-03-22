import { google, calendar_v3 } from 'googleapis';
import { config } from '../config';
import { EventRecord } from './database';
import logger from '../utils/logger';

// ─── Initialization ─────────────────────────────────────────────────────────

let calendar: calendar_v3.Calendar | null = null;
let calendarId: string = '';

function isConfigured(): boolean {
  return !!config.google.calendarId && !!config.google.credentialsPath;
}

function getCalendar(): calendar_v3.Calendar | null {
  if (calendar) return calendar;

  if (!isConfigured()) {
    return null;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: config.google.credentialsPath,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    calendar = google.calendar({ version: 'v3', auth });
    calendarId = config.google.calendarId;
    logger.info('Google Calendar API initialized');
    return calendar;
  } catch (err) {
    logger.warn(`Failed to initialize Google Calendar API: ${err}`);
    return null;
  }
}

// Log once on import if not configured
if (!isConfigured()) {
  logger.info('Google Calendar sync is not configured (GOOGLE_CALENDAR_ID or GOOGLE_CREDENTIALS_PATH not set). Events will work without GCal.');
}

// ─── Public API ─────────────────────────────────────────────────────────────

function formatScopeLabel(scope: string): string {
  return scope === 'state' ? 'CVMA MN State' : `CVMA MN Chapter ${scope}`;
}

export async function pushEventToGCal(event: EventRecord): Promise<string | null> {
  const cal = getCalendar();
  if (!cal) return null;

  try {
    const gcalEvent: calendar_v3.Schema$Event = {
      summary: event.title,
      description: `${event.description}\n\nScope: ${formatScopeLabel(event.scope)}`,
      location: event.location || undefined,
      start: {
        dateTime: event.event_date,
        timeZone: 'America/Chicago',
      },
      end: {
        dateTime: event.end_date || event.event_date,
        timeZone: 'America/Chicago',
      },
    };

    const response = await cal.events.insert({
      calendarId,
      requestBody: gcalEvent,
    });

    const gcalEventId = response.data.id || null;
    if (gcalEventId) {
      logger.info(`Event pushed to Google Calendar: ${gcalEventId}`);
    }
    return gcalEventId;
  } catch (err) {
    logger.error(`Failed to push event to Google Calendar: ${err}`);
    return null;
  }
}

export async function updateGCalEvent(
  gcalEventId: string,
  event: EventRecord,
): Promise<void> {
  const cal = getCalendar();
  if (!cal) return;

  try {
    await cal.events.update({
      calendarId,
      eventId: gcalEventId,
      requestBody: {
        summary: event.title,
        description: `${event.description}\n\nScope: ${formatScopeLabel(event.scope)}`,
        location: event.location || undefined,
        start: {
          dateTime: event.event_date,
          timeZone: 'America/Chicago',
        },
        end: {
          dateTime: event.end_date || event.event_date,
          timeZone: 'America/Chicago',
        },
      },
    });
    logger.info(`Google Calendar event updated: ${gcalEventId}`);
  } catch (err) {
    logger.error(`Failed to update Google Calendar event: ${err}`);
  }
}

export async function deleteGCalEvent(gcalEventId: string): Promise<void> {
  const cal = getCalendar();
  if (!cal) return;

  try {
    await cal.events.delete({
      calendarId,
      eventId: gcalEventId,
    });
    logger.info(`Google Calendar event deleted: ${gcalEventId}`);
  } catch (err) {
    logger.error(`Failed to delete Google Calendar event: ${err}`);
  }
}
