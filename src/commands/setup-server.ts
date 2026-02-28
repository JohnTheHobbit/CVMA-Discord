import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import { setupServer } from '../services/server-builder';
import logger from '../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('setup-server')
  .setDescription('Create all CVMA roles, categories, and channels (Admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    await setupServer(interaction.guild);
    await interaction.editReply(
      'Server setup complete! All roles, categories, and channels have been created.\n\n' +
      'You can run this command again at any time — it will not create duplicates.',
    );
  } catch (err) {
    logger.error(`Server setup failed: ${err}`);
    await interaction.editReply(
      'Server setup encountered an error. Check the bot logs for details. ' +
      'Make sure the bot role is positioned high enough in the role hierarchy.',
    );
  }
}
