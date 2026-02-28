import { REST, Routes } from 'discord.js';
import { config } from './config';
import * as verify from './commands/verify';
import * as setupServer from './commands/setup-server';
import * as announce from './commands/announce';
import logger from './utils/logger';

const commands = [
  verify.data.toJSON(),
  setupServer.data.toJSON(),
  announce.data.toJSON(),
];

const rest = new REST().setToken(config.discord.token);

(async () => {
  try {
    logger.info(`Registering ${commands.length} slash commands...`);

    await rest.put(
      Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
      { body: commands },
    );

    logger.info('Slash commands registered successfully.');
  } catch (err) {
    logger.error(`Failed to register commands: ${err}`);
    process.exit(1);
  }
})();
