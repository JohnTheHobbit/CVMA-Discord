import {
  Interaction,
  GuildMember,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalActionRowComponentBuilder,
} from 'discord.js';
import * as verify from '../commands/verify';
import * as setupServer from '../commands/setup-server';
import * as announce from '../commands/announce';
import { performVerification } from '../commands/verify';
import {
  VERIFY_BUTTON_ID,
  VERIFY_MODAL_ID,
  EMAIL_INPUT_ID,
} from '../utils/constants';
import logger from '../utils/logger';

const commands = new Map([
  [verify.data.name, verify],
  [setupServer.data.name, setupServer],
  [announce.data.name, announce],
]);

export async function onInteractionCreate(interaction: Interaction): Promise<void> {
  // ── 1. Slash commands ──
  if (interaction.isChatInputCommand()) {
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
    return;
  }

  // ── 2. Button click: open the verification modal ──
  if (interaction.isButton() && interaction.customId === VERIFY_BUTTON_ID) {
    try {
      const modal = new ModalBuilder()
        .setCustomId(VERIFY_MODAL_ID)
        .setTitle('CVMA Membership Verification');

      const emailInput = new TextInputBuilder()
        .setCustomId(EMAIL_INPUT_ID)
        .setLabel('Email linked to your CVMA account')
        .setPlaceholder('you@example.com')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(5)
        .setMaxLength(320);

      const row = new ActionRowBuilder<ModalActionRowComponentBuilder>()
        .addComponents(emailInput);

      modal.addComponents(row);
      await interaction.showModal(modal);
    } catch (err) {
      logger.error(`Error showing verify modal: ${err}`);
    }
    return;
  }

  // ── 3. Modal submission: run verification ──
  if (interaction.isModalSubmit() && interaction.customId === VERIFY_MODAL_ID) {
    await interaction.deferReply({ ephemeral: true });

    const email = interaction.fields.getTextInputValue(EMAIL_INPUT_ID);
    const guild = interaction.guild;

    if (!guild || !interaction.member) {
      await interaction.editReply('This can only be used in a server.');
      return;
    }

    const member = interaction.member as GuildMember;

    try {
      const result = await performVerification(email, member, guild);
      await interaction.editReply(result.message);
    } catch (err) {
      logger.error(`Modal verification failed for ${interaction.user.tag}: ${err}`);
      await interaction.editReply(
        'An error occurred during verification. Please try again later or contact the State Rep.',
      );
    }
    return;
  }
}
