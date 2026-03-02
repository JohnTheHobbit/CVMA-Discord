import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  GuildMember,
  TextChannel,
  EmbedBuilder,
} from 'discord.js';
import { findMemberByEmail, linkDiscordId } from '../services/airtable';
import {
  CHAPTER_NUMBERS,
  ROLES,
  MEMBER_TYPE_MAP,
} from '../utils/constants';
import logger from '../utils/logger';

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

  const member = interaction.member as GuildMember;

  try {
    const record = await findMemberByEmail(email);

    if (!record) {
      await interaction.editReply(
        'No membership record was found for that email address. ' +
        'Please make sure you are using the email associated with your combatvet.us account. ' +
        'If you continue to have issues, contact the State Rep for assistance.',
      );
      return;
    }

    // Check if member is active
    if (record.memberStatus.toLowerCase().trim() === 'inactive') {
      await interaction.editReply(
        'Your membership is currently inactive. ' +
        'Please contact the State Rep if you believe this is an error.',
      );
      return;
    }

    // Check if this AirTable record is already linked to a different Discord user
    if (record.discordId && record.discordId !== interaction.user.id) {
      await interaction.editReply(
        'This membership is already linked to a different Discord account. ' +
        'If this is an error, contact the State Rep.',
      );
      return;
    }

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
    await linkDiscordId(record.recordId, interaction.user.id);

    // Build display name (for embed/log) and server nickname
    const displayName = record.roadName
      ? `${record.firstName} "${record.roadName}" ${record.lastName}`
      : `${record.firstName} ${record.lastName}`;

    const namePart = record.roadName || `${record.firstName} ${record.lastName}`;
    const nickParts = [namePart];
    if (chapterNum) nickParts.push(chapterNum);
    if (title) nickParts.push(title);
    const nickname = nickParts.join(' - ');

    try {
      await member.setNickname(nickname, 'CVMA verification');
    } catch (nickErr) {
      logger.warn(`Could not set nickname for ${interaction.user.tag}: ${nickErr}`);
    }

    const chapterLabel = chapterNum ? `Chapter ${chapterNum}` : 'Unknown chapter';

    await interaction.editReply(
      `Welcome, **${displayName}**! You've been verified as a member of **${chapterLabel}**.\n\n` +
      `Roles assigned: ${assigned.map((r) => `\`${r}\``).join(', ')}\n\n` +
      'You now have access to your chapter channels and all state-level channels.',
    );

    logger.info(
      `Verified ${interaction.user.tag} as ${displayName} (${chapterLabel}). Roles: ${assigned.join(', ')}`,
    );

    // Announce in #introductions
    const introChannel = guild.channels.cache.find(
      (c) => c.name === 'introductions' && c.isTextBased(),
    ) as TextChannel | undefined;

    if (introChannel) {
      const embed = new EmbedBuilder()
        .setTitle('New Member Verified!')
        .setDescription(
          `Welcome **${displayName}** to CVMA Minnesota!\n\n` +
          `**Chapter:** ${chapterLabel}\n` +
          `**Member Type:** ${memberRole || 'N/A'}`,
        )
        .setColor(0x2e8b57)
        .setThumbnail(interaction.user.displayAvatarURL())
        .setTimestamp();

      await introChannel.send({ embeds: [embed] });
    }
  } catch (err) {
    logger.error(`Verification failed for ${interaction.user.tag}: ${err}`);
    await interaction.editReply(
      'An error occurred during verification. Please try again later or contact the State Rep.',
    );
  }
}
