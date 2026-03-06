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
import { preVerifyCheck, performVerification, buildEnterCodeRow } from '../commands/verify';
import { generateAndStore, validate, remove } from '../services/otp-store';
import { sendVerificationCode } from '../services/email';
import {
  VERIFY_BUTTON_ID,
  VERIFY_MODAL_ID,
  EMAIL_INPUT_ID,
  OTP_ENTER_CODE_BUTTON_ID,
  OTP_CODE_MODAL_ID,
  OTP_CODE_INPUT_ID,
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

  // ── 2. Button: open the email modal ──
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

  // ── 3. Button: open the OTP code modal ──
  if (interaction.isButton() && interaction.customId === OTP_ENTER_CODE_BUTTON_ID) {
    try {
      const modal = new ModalBuilder()
        .setCustomId(OTP_CODE_MODAL_ID)
        .setTitle('Enter Verification Code');

      const codeInput = new TextInputBuilder()
        .setCustomId(OTP_CODE_INPUT_ID)
        .setLabel('6-digit code from your email')
        .setPlaceholder('123456')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(6)
        .setMaxLength(6);

      const row = new ActionRowBuilder<ModalActionRowComponentBuilder>()
        .addComponents(codeInput);

      modal.addComponents(row);
      await interaction.showModal(modal);
    } catch (err) {
      logger.error(`Error showing OTP code modal: ${err}`);
    }
    return;
  }

  // ── 4. Modal: email submitted — send OTP ──
  if (interaction.isModalSubmit() && interaction.customId === VERIFY_MODAL_ID) {
    await interaction.deferReply({ ephemeral: true });

    const email = interaction.fields.getTextInputValue(EMAIL_INPUT_ID);
    const guild = interaction.guild;

    if (!guild || !interaction.member) {
      await interaction.editReply('This can only be used in a server.');
      return;
    }

    try {
      // Pre-verify: check AirTable
      const check = await preVerifyCheck(email, interaction.user.id);
      if (!check.ok) {
        await interaction.editReply(check.message);
        return;
      }

      // Generate OTP
      const code = generateAndStore(interaction.user.id, guild.id, email);
      if (!code) {
        await interaction.editReply(
          'Too many verification attempts. Please try again in an hour.',
        );
        return;
      }

      // Send email
      try {
        await sendVerificationCode(email, code);
      } catch (emailErr) {
        remove(interaction.user.id);
        logger.error(`Failed to send verification email to ${email}: ${emailErr}`);
        await interaction.editReply(
          'Failed to send verification email. Please try again later or contact the State Rep.',
        );
        return;
      }

      await interaction.editReply({
        content:
          'A verification code has been sent to your email. ' +
          'Click the button below to enter it.\n\n' +
          '*The code expires in 10 minutes.*',
        components: [buildEnterCodeRow()],
      });
    } catch (err) {
      logger.error(`Verification failed for ${interaction.user.tag}: ${err}`);
      await interaction.editReply(
        'An error occurred during verification. Please try again later or contact the State Rep.',
      );
    }
    return;
  }

  // ── 5. Modal: OTP code submitted — validate and complete ──
  if (interaction.isModalSubmit() && interaction.customId === OTP_CODE_MODAL_ID) {
    await interaction.deferReply({ ephemeral: true });

    const code = interaction.fields.getTextInputValue(OTP_CODE_INPUT_ID);
    const guild = interaction.guild;

    if (!guild || !interaction.member) {
      await interaction.editReply('This can only be used in a server.');
      return;
    }

    const result = validate(interaction.user.id, code);

    if (!result.valid) {
      const messages: Record<string, string> = {
        wrong_code: 'Incorrect code. Please try again.',
        expired: 'Your code has expired. Please start over by clicking the Verify button again.',
        too_many_attempts: 'Too many incorrect attempts. Please start over by clicking the Verify button again.',
        no_pending: 'No pending verification found. Please start over by clicking the Verify button.',
      };
      await interaction.editReply(messages[result.reason]);
      return;
    }

    const member = interaction.member as GuildMember;

    try {
      const verifyResult = await performVerification(result.email, member, guild);
      await interaction.editReply(verifyResult.message);
    } catch (err) {
      logger.error(`OTP verification failed for ${interaction.user.tag}: ${err}`);
      await interaction.editReply(
        'An error occurred during verification. Please try again later or contact the State Rep.',
      );
    }
    return;
  }
}
