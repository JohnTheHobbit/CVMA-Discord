import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { config } from '../config';
import logger from '../utils/logger';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EventRecord {
  id: string;
  title: string;
  description: string;
  location: string;
  event_date: string;
  end_date: string;
  scope: string;
  created_by: string;
  created_at: string;
  channel_id: string;
  message_id: string;
  gcal_event_id: string;
  discord_event_id: string;
  status: string;
  reminder_sent_1d: number;
  reminder_sent_1h: number;
}

export interface RsvpRecord {
  event_id: string;
  user_id: string;
  status: string;
  user_display_name: string;
  updated_at: string;
}

export interface TimePollOption {
  id: string;
  event_id: string;
  time_option: string;
  label: string;
}

export interface TimePollVote {
  poll_option_id: string;
  user_id: string;
}

// ─── Database singleton ─────────────────────────────────────────────────────

let db: Database.Database;

export function initDatabase(): void {
  db = new Database(config.db.path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      event_date TEXT NOT NULL,
      end_date TEXT NOT NULL DEFAULT '',
      scope TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      channel_id TEXT NOT NULL DEFAULT '',
      message_id TEXT NOT NULL DEFAULT '',
      gcal_event_id TEXT NOT NULL DEFAULT '',
      discord_event_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      reminder_sent_1d INTEGER NOT NULL DEFAULT 0,
      reminder_sent_1h INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS rsvps (
      event_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL,
      user_display_name TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (event_id, user_id),
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS time_poll_options (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      time_option TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS time_poll_votes (
      poll_option_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      PRIMARY KEY (poll_option_id, user_id),
      FOREIGN KEY (poll_option_id) REFERENCES time_poll_options(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_events_status_date ON events(status, event_date);
    CREATE INDEX IF NOT EXISTS idx_rsvps_event ON rsvps(event_id);
    CREATE INDEX IF NOT EXISTS idx_poll_options_event ON time_poll_options(event_id);
  `);

  logger.info(`Database initialized at ${config.db.path}`);
}

// ─── Events ─────────────────────────────────────────────────────────────────

export function createEvent(data: {
  title: string;
  description: string;
  location: string;
  eventDate: string;
  endDate: string;
  scope: string;
  createdBy: string;
}): EventRecord {
  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO events (id, title, description, location, event_date, end_date, scope, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.title, data.description, data.location, data.eventDate, data.endDate, data.scope, data.createdBy, now);

  return getEvent(id)!;
}

export function getEvent(id: string): EventRecord | undefined {
  return db.prepare('SELECT * FROM events WHERE id = ?').get(id) as EventRecord | undefined;
}

export function updateEventMessageId(id: string, channelId: string, messageId: string): void {
  db.prepare('UPDATE events SET channel_id = ?, message_id = ? WHERE id = ?').run(channelId, messageId, id);
}

export function updateEventGcalId(id: string, gcalEventId: string): void {
  db.prepare('UPDATE events SET gcal_event_id = ? WHERE id = ?').run(gcalEventId, id);
}

export function updateDiscordEventId(id: string, discordEventId: string): void {
  db.prepare('UPDATE events SET discord_event_id = ? WHERE id = ?').run(discordEventId, id);
}

export function updateEventDate(id: string, eventDate: string): void {
  db.prepare('UPDATE events SET event_date = ? WHERE id = ?').run(eventDate, id);
}

export function cancelEvent(id: string): void {
  db.prepare("UPDATE events SET status = 'cancelled' WHERE id = ?").run(id);
}

export function getUpcomingEvents(scope?: string): EventRecord[] {
  const now = new Date().toISOString();
  if (scope) {
    return db.prepare(
      "SELECT * FROM events WHERE status = 'active' AND event_date >= ? AND scope = ? ORDER BY event_date ASC",
    ).all(now, scope) as EventRecord[];
  }
  return db.prepare(
    "SELECT * FROM events WHERE status = 'active' AND event_date >= ? ORDER BY event_date ASC",
  ).all(now) as EventRecord[];
}

export function getEventsNeedingReminder(type: '1d' | '1h'): EventRecord[] {
  const now = new Date();
  const cutoff = new Date(now.getTime() + (type === '1d' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000));
  const col = type === '1d' ? 'reminder_sent_1d' : 'reminder_sent_1h';

  return db.prepare(
    `SELECT * FROM events WHERE status = 'active' AND event_date <= ? AND event_date >= ? AND ${col} = 0`,
  ).all(cutoff.toISOString(), now.toISOString()) as EventRecord[];
}

export function markReminderSent(id: string, type: '1d' | '1h'): void {
  const col = type === '1d' ? 'reminder_sent_1d' : 'reminder_sent_1h';
  db.prepare(`UPDATE events SET ${col} = 1 WHERE id = ?`).run(id);
}

// ─── RSVPs ──────────────────────────────────────────────────────────────────

export function upsertRsvp(eventId: string, userId: string, status: string, displayName: string): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO rsvps (event_id, user_id, status, user_display_name, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(event_id, user_id)
    DO UPDATE SET status = excluded.status, user_display_name = excluded.user_display_name, updated_at = excluded.updated_at
  `).run(eventId, userId, status, displayName, now);
}

export function removeRsvp(eventId: string, userId: string): void {
  db.prepare('DELETE FROM rsvps WHERE event_id = ? AND user_id = ?').run(eventId, userId);
}

export function getRsvps(eventId: string): RsvpRecord[] {
  return db.prepare('SELECT * FROM rsvps WHERE event_id = ? ORDER BY updated_at ASC').all(eventId) as RsvpRecord[];
}

// ─── Time Polls ─────────────────────────────────────────────────────────────

export function createTimePollOption(eventId: string, timeOption: string, label: string): TimePollOption {
  const id = randomUUID();
  db.prepare('INSERT INTO time_poll_options (id, event_id, time_option, label) VALUES (?, ?, ?, ?)').run(
    id, eventId, timeOption, label,
  );
  return { id, event_id: eventId, time_option: timeOption, label };
}

export function getTimePollOptionById(id: string): TimePollOption | undefined {
  return db.prepare('SELECT * FROM time_poll_options WHERE id = ?').get(id) as TimePollOption | undefined;
}

export function getTimePollOptions(eventId: string): TimePollOption[] {
  return db.prepare('SELECT * FROM time_poll_options WHERE event_id = ?').all(eventId) as TimePollOption[];
}

export function addTimePollVote(pollOptionId: string, userId: string): void {
  db.prepare(
    'INSERT OR IGNORE INTO time_poll_votes (poll_option_id, user_id) VALUES (?, ?)',
  ).run(pollOptionId, userId);
}

export function removeTimePollVote(pollOptionId: string, userId: string): void {
  db.prepare('DELETE FROM time_poll_votes WHERE poll_option_id = ? AND user_id = ?').run(pollOptionId, userId);
}

export function hasTimePollVote(pollOptionId: string, userId: string): boolean {
  const row = db.prepare(
    'SELECT 1 FROM time_poll_votes WHERE poll_option_id = ? AND user_id = ?',
  ).get(pollOptionId, userId);
  return !!row;
}

export function getTimePollResults(eventId: string): { option: TimePollOption; votes: string[] }[] {
  const options = getTimePollOptions(eventId);
  return options.map((option) => {
    const votes = db.prepare(
      'SELECT user_id FROM time_poll_votes WHERE poll_option_id = ?',
    ).all(option.id) as { user_id: string }[];
    return { option, votes: votes.map((v) => v.user_id) };
  });
}
