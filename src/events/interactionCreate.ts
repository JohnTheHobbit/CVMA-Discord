import { Interaction } from 'discord.js';
import * as verify from '../commands/verify';
import * as setupServer from '../commands/setup-server';
import * as announce from '../commands/announce';
import logger from '../utils/logger';

const commands = new Map([
  [verify.data.name, verify],
  [setupServer.data.name, setupServer],
  [announce.data.name, announce],
]);

export async function onInteractionCreate(interaction: Interaction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) {
    logger.warn(`Unknown command: ${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    logger.error(`Error executing /${interaction.commandName}: ${err}`);
    const reply = {
      content: 'An error occurred while running this command.',
      ephemeral: true,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply(reply);
    } else {
      await interaction.reply(reply);
    }
  }
}
