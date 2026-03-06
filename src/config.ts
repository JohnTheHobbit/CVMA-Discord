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
  syncCron: process.env.SYNC_CRON || '0 */6 * * *',
  logLevel: process.env.LOG_LEVEL || 'info',
} as const;
