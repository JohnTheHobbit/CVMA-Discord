import { Guild, TextChannel, EmbedBuilder } from 'discord.js';
import { getLinkedMembers, MemberRecord } from './airtable';
import {
  CHAPTER_NUMBERS,
  ROLES,
  MEMBER_TYPE_MAP,
  ChapterNumber,
} from '../utils/constants';
import logger from '../utils/logger';

interface RoleChange {
  discordId: string;
  displayName: string;
  added: string[];
  removed: string[];
}

/** Extract the chapter number from an AirTable chapter field value. */
function extractChapterNumber(chapterField: string): ChapterNumber | null {
  for (const ch of CHAPTER_NUMBERS) {
    if (chapterField.includes(ch)) return ch;
  }
  return null;
}

/** Check if a member is active. */
function isActiveMember(member: MemberRecord): boolean {
  const status = member.memberStatus.toLowerCase().trim();
  return status !== 'inactive';
}

/** Determine what roles a member should have based on their AirTable record. */
function expectedRoles(member: MemberRecord): string[] {
  // Inactive members get no roles — removes all access
  if (!isActiveMember(member)) return [];

  const roles: string[] = [ROLES.VERIFIED];

  // Chapter role
  const ch = extractChapterNumber(member.chapter);
  if (ch) {
    roles.push(ROLES.chapter(ch));
  }

  // Member type role
  const memberRole = MEMBER_TYPE_MAP[member.memberType];
  if (memberRole) {
    roles.push(memberRole);
  }

  // CEB / SEB from Title field
  const title = (member.title || '').trim();
  if (title.toLowerCase().startsWith('state')) {
    roles.push(ROLES.SEB);
  } else if (title.toLowerCase().startsWith('chapter') && ch) {
    roles.push(ROLES.ceb(ch));
  }

  return roles;
}

/** Run the role sync for all linked members. Returns a list of changes made. */
export async function syncRoles(guild: Guild): Promise<RoleChange[]> {
  logger.info('Starting role sync...');
  const members = await getLinkedMembers();
  const changes: RoleChange[] = [];

  // All managed role names (roles the bot assigns/removes)
  const managedRoleNames = new Set<string>([
    ROLES.VERIFIED,
    ROLES.SEB,
    ROLES.FULL_MEMBER,
    ROLES.AUXILIARY,
    ROLES.SUPPORT,
    ROLES.SUPPORT_AUXILIARY,
    ...CHAPTER_NUMBERS.map(ROLES.chapter),
    ...CHAPTER_NUMBERS.map(ROLES.ceb),
  ]);

  for (const member of members) {
    if (!member.discordId) continue;

    let guildMember;
    try {
      guildMember = await guild.members.fetch(member.discordId);
    } catch {
      logger.warn(`Member ${member.discordId} (${member.firstName} ${member.lastName}) not found in guild — may have left`);
      continue;
    }

    const expected = new Set(expectedRoles(member));
    const currentManaged = guildMember.roles.cache
      .filter((r) => managedRoleNames.has(r.name))
      .map((r) => r.name);

    const toAdd = [...expected].filter((name) => !currentManaged.includes(name));
    const toRemove = currentManaged.filter((name) => !expected.has(name));

    if (toAdd.length === 0 && toRemove.length === 0) continue;

    // Apply changes
    for (const roleName of toAdd) {
      const role = guild.roles.cache.find((r) => r.name === roleName);
      if (role) {
        await guildMember.roles.add(role, 'CVMA role sync');
        logger.info(`Added role "${roleName}" to ${guildMember.displayName}`);
      } else {
        logger.warn(`Role "${roleName}" not found in guild`);
      }
    }

    for (const roleName of toRemove) {
      const role = guild.roles.cache.find((r) => r.name === roleName);
      if (role) {
        await guildMember.roles.remove(role, 'CVMA role sync');
        logger.info(`Removed role "${roleName}" from ${guildMember.displayName}`);
      }
    }

    changes.push({
      discordId: member.discordId,
      displayName: guildMember.displayName,
      added: toAdd,
      removed: toRemove,
    });
  }

  logger.info(`Role sync complete. ${changes.length} member(s) updated.`);
  return changes;
}

/** Post a sync summary to the #seb-bot-log channel. */
export async function postSyncSummary(guild: Guild, changes: RoleChange[]): Promise<void> {
  const logChannel = guild.channels.cache.find(
    (c) => c.name === 'seb-bot-log' && c.isTextBased(),
  ) as TextChannel | undefined;

  if (!logChannel) {
    logger.warn('Could not find #seb-bot-log channel — skipping summary');
    return;
  }

  if (changes.length === 0) {
    await logChannel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle('Role Sync Complete')
          .setDescription('No changes needed — all roles are up to date.')
          .setColor(0x2e8b57)
          .setTimestamp(),
      ],
    });
    return;
  }

  const lines = changes.map((c) => {
    const parts: string[] = [];
    if (c.added.length > 0) parts.push(`+${c.added.join(', +')}`);
    if (c.removed.length > 0) parts.push(`-${c.removed.join(', -')}`);
    return `**${c.displayName}**: ${parts.join(' | ')}`;
  });

  await logChannel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle('Role Sync Complete')
        .setDescription(lines.join('\n'))
        .setFooter({ text: `${changes.length} member(s) updated` })
        .setColor(0x4169e1)
        .setTimestamp(),
    ],
  });
}
