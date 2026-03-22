import dotenv from 'dotenv';
dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  discord: {
    token: required('DISCORD_TOKEN'),
    clientId: required('DISCORD_CLIENT_ID'),
    guildId: required('DISCORD_GUILD_ID'),
  },
  airtable: {
    apiKey: required('AIRTABLE_API_KEY'),
    baseId: required('AIRTABLE_BASE_ID'),
    tableName: process.env.AIRTABLE_TABLE_NAME || 'Members',
  },
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: required('SMTP_USER'),
    pass: required('SMTP_PASS'),
    from: process.env.SMTP_FROM || process.env.SMTP_USER || '',
  },
  db: {
    path: process.env.DB_PATH || '/app/data/bot.db',
  },
  google: {
    credentialsPath: process.env.GOOGLE_CREDENTIALS_PATH || '',
    calendarId: process.env.GOOGLE_CALENDAR_ID || '',
  },
  syncCron: process.env.SYNC_CRON || '0 */6 * * *',
  reminderCron: process.env.REMINDER_CRON || '*/5 * * * *',
  verifyReminders: {
    welcomeDmEnabled: process.env.VERIFY_WELCOME_DM !== 'false',
    firstReminderDays: parseInt(process.env.VERIFY_REMINDER_1_DAYS || '3', 10),
    secondReminderDays: parseInt(process.env.VERIFY_REMINDER_2_DAYS || '7', 10),
    kickAfterDays: parseInt(process.env.VERIFY_KICK_AFTER_DAYS || '14', 10),
    checkCron: process.env.VERIFY_REMINDER_CRON || '0 9 * * *',
  },
  logLevel: process.env.LOG_LEVEL || 'info',
} as const;
