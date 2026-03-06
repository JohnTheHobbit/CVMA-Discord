import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  Guild,
  GuildMember,
  TextChannel,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  MessageActionRowComponentBuilder,
} from 'discord.js';
import { findMemberByEmail, linkDiscordId } from '../services/airtable';
import { generateAndStore } from '../services/otp-store';
import { sendVerificationCode } from '../services/email';
import {
  CHAPTER_NUMBERS,
  ROLES,
  MEMBER_TYPE_MAP,
  TITLE_ABBREVIATIONS,
  OTP_ENTER_CODE_BUTTON_ID,
} from '../utils/constants';
import logger from '../utils/logger';

// ─── Pre-verification check ────────────────────────────────────────────────

export interface PreVerifyResult {
  ok: true;
  email: string;
}
export interface PreVerifyError {
  ok: false;
  message: string;
}

/**
 * Check that a member exists in AirTable, is active, and isn't linked
 * to a different Discord account. Run before sending an OTP.
 */
export async function preVerifyCheck(
  email: string,
  discordUserId: string,
): Promise<PreVerifyResult | PreVerifyError> {
  const record = await findMemberByEmail(email);

  if (!record) {
    return {
      ok: false,
      message:
        'No membership record was found for that email address. ' +
        'Please make sure you are using the email associated with your combatvet.us account. ' +
        'If you continue to have issues, contact the State Rep for assistance.',
    };
  }

  if (record.memberStatus.toLowerCase().trim() === 'inactive') {
    return {
      ok: false,
      message:
        'Your membership is currently inactive. ' +
        'Please contact the State Rep if you believe this is an error.',
    };
  }

  if (record.discordId && record.discordId !== discordUserId) {
    return {
      ok: false,
      message:
        'This membership is already linked to a different Discord account. ' +
        'If this is an error, contact the State Rep.',
    };
  }

  return { ok: true, email: record.email };
}

// ─── Shared verification logic ──────────────────────────────────────────────

export interface VerifyResult {
  success: boolean;
  message: string;
}

/**
 * Core verification logic — assigns roles, sets nickname, posts intro.
 * Called after OTP validation succeeds.
 */
export async function performVerification(
  email: string,
  member: GuildMember,
  guild: Guild,
): Promise<VerifyResult> {
  const record = await findMemberByEmail(email);

  if (!record) {
    return { success: false, message: 'Membership record not found.' };
  }

  // Check if this is a re-verification (member already has Verified role)
  const isReVerify = member.roles.cache.some((r) => r.name === ROLES.VERIFIED);

  // Determine which roles to assign
  const rolesToAdd: string[] = [ROLES.VERIFIED];

  // Chapter role
  let chapterNum: string | null = null;
  for (const ch of CHAPTER_NUMBERS) {
    if (record.chapter.includes(ch)) {
      chapterNum = ch;
      rolesToAdd.push(ROLES.chapter(ch));
      break;
    }
  }

  // Member type role
  const memberRole = MEMBER_TYPE_MAP[record.memberType];
  if (memberRole) rolesToAdd.push(memberRole);

  // CEB / SEB from Title
  const title = (record.title || '').trim();
  if (title.toLowerCase().startsWith('state')) {
    rolesToAdd.push(ROLES.SEB);
  } else if (title.toLowerCase().startsWith('chapter') && chapterNum) {
    rolesToAdd.push(ROLES.ceb(chapterNum));
  }

  // Assign roles
  const assigned: string[] = [];
  for (const roleName of rolesToAdd) {
    const role = guild.roles.cache.find((r) => r.name === roleName);
    if (role) {
      await member.roles.add(role, 'CVMA verification');
      assigned.push(roleName);
    } else {
      logger.warn(`Role "${roleName}" not found in guild during verification`);
    }
  }

  // Link Discord ID in AirTable
  await linkDiscordId(record.recordId, member.id);

  // Build display name (for embed/log) and server nickname
  const displayName = record.roadName
    ? `${record.firstName} "${record.roadName}" ${record.lastName}`
    : `${record.firstName} ${record.lastName}`;

  const namePart = record.roadName || `${record.firstName} ${record.lastName}`;
  const titleAbbrev = title
    ? TITLE_ABBREVIATIONS[title.toLowerCase()] || title
    : '';
  const nickParts = [namePart];
  if (chapterNum) nickParts.push(chapterNum);
  if (titleAbbrev) nickParts.push(titleAbbrev);
  let nickname = nickParts.join(' - ');

  // Discord nicknames are limited to 32 characters
  if (nickname.length > 32) {
    nickname = nickname.substring(0, 32);
  }

  try {
    await member.setNickname(nickname, 'CVMA verification');
  } catch (nickErr) {
    logger.warn(`Could not set nickname for ${member.user.tag}: ${nickErr}`);
  }

  const chapterLabel = chapterNum ? `Chapter ${chapterNum}` : 'Unknown chapter';

  logger.info(
    `Verified ${member.user.tag} as ${displayName} (${chapterLabel}). Roles: ${assigned.join(', ')}`,
  );

  // Announce in #introductions (only on first verification)
  const introChannel = !isReVerify
    ? guild.channels.cache.find(
        (c) => c.name === 'introductions' && c.isTextBased(),
      ) as TextChannel | undefined
    : undefined;

  if (introChannel) {
    const embed = new EmbedBuilder()
      .setTitle('New Member Verified!')
      .setDescription(
        `Welcome **${displayName}** to CVMA Minnesota!\n\n` +
        `**Chapter:** ${chapterLabel}\n` +
        `**Member Type:** ${memberRole || 'N/A'}`,
      )
      .setColor(0x2e8b57)
      .setThumbnail(member.user.displayAvatarURL())
      .setTimestamp();

    await introChannel.send({ embeds: [embed] });
  }

  return {
    success: true,
    message:
      `Welcome, **${displayName}**! You've been verified as a member of **${chapterLabel}**.\n\n` +
      `Roles assigned: ${assigned.map((r) => `\`${r}\``).join(', ')}\n\n` +
      'You now have access to your chapter channels and all state-level channels.',
  };
}

// ─── OTP helpers ────────────────────────────────────────────────────────────

/** Build the "Enter Code" button row for OTP flow replies. */
export function buildEnterCodeRow(): ActionRowBuilder<MessageActionRowComponentBuilder> {
  const button = new ButtonBuilder()
    .setCustomId(OTP_ENTER_CODE_BUTTON_ID)
    .setLabel('Enter Code')
    .setStyle(ButtonStyle.Success);

  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(button);
}

// ─── Slash command ──────────────────────────────────────────────────────────

export const data = new SlashCommandBuilder()
  .setName('verify')
  .setDescription('Verify your CVMA membership and get your roles')
  .addStringOption((opt) =>
    opt
      .setName('email')
      .setDescription('The email address associated with your CVMA membership')
      .setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const email = interaction.options.getString('email', true);
  const guild = interaction.guild;

  if (!guild || !interaction.member) {
    await interaction.editReply('This command can only be used in a server.');
    return;
  }

  try {
    // Pre-verify: check AirTable
    const check = await preVerifyCheck(email, interaction.user.id);
    if (!check.ok) {
      await interaction.editReply(check.message);
      return;
    }

    // Generate OTP and send email
    const code = generateAndStore(interaction.user.id, guild.id, email);
    if (!code) {
      await interaction.editReply(
        'Too many verification attempts. Please try again in an hour.',
      );
      return;
    }

    await sendVerificationCode(email, code);

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
}
