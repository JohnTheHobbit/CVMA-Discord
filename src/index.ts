import { Client, GatewayIntentBits } from 'discord.js';
import { config } from './config';
import { onReady } from './events/ready';
import { onGuildMemberAdd } from './events/guildMemberAdd';
import { onInteractionCreate } from './events/interactionCreate';
import logger from './utils/logger';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.once('ready', (readyClient) => {
  onReady(readyClient).catch((err) => logger.error(`Ready handler error: ${err}`));
});

client.on('guildMemberAdd', (member) => {
  onGuildMemberAdd(member).catch((err) => logger.error(`GuildMemberAdd handler error: ${err}`));
});

client.on('interactionCreate', (interaction) => {
  onInteractionCreate(interaction).catch((err) => logger.error(`InteractionCreate handler error: ${err}`));
});

client.login(config.discord.token).catch((err) => {
  logger.error(`Failed to login: ${err}`);
  process.exit(1);
});
