import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  TextChannel,
  EmbedBuilder,
  GuildMember,
  CategoryChannel,
  ChannelType,
} from 'discord.js';
import { CHAPTER_NUMBERS, CATEGORIES, ROLES } from '../utils/constants';
import logger from '../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('announce')
  .setDescription('Post a formatted announcement to a chapter or state announcements channel')
  .addStringOption((opt) =>
    opt
      .setName('title')
      .setDescription('Announcement title')
      .setRequired(true),
  )
  .addStringOption((opt) =>
    opt
      .setName('message')
      .setDescription('Announcement body text')
      .setRequired(true),
  )
  .addStringOption((opt) =>
    opt
      .setName('scope')
      .setDescription('Post to state or chapter announcements (SEB only for state)')
      .addChoices(
        { name: 'State', value: 'state' },
        { name: 'Chapter', value: 'chapter' },
      ),
  );

/** Find the announcements channel for a chapter based on context or CEB membership. */
function findChapterAnnouncementsChannel(
  interaction: ChatInputCommandInteraction,
  isSEB: boolean,
  cebChapters: string[],
): TextChannel | null {
  const currentChannel = interaction.channel;

  // If inside a chapter category, use that chapter's announcements
  if (currentChannel && 'parent' in currentChannel && currentChannel.parent) {
    const categoryName = currentChannel.parent.name;
    for (const ch of CHAPTER_NUMBERS) {
      if (categoryName.includes(ch)) {
        if (isSEB || cebChapters.includes(ch)) {
          const parent = currentChannel.parent;
          if (parent.type === ChannelType.GuildCategory) {
            return parent.children.cache.find(
              (c): c is TextChannel => c.name === 'announcements' && c.isTextBased(),
            ) ?? null;
          }
        }
        break;
      }
    }
  }

  // Fallback: if CEB of exactly one chapter, use that
  if (cebChapters.length === 1) {
    const chapterCat = interaction.guild?.channels.cache.find(
      (c): c is CategoryChannel =>
        c.type === ChannelType.GuildCategory &&
        c.name.includes(cebChapters[0]) &&
        c.name.includes('CHAPTER'),
    );
    if (chapterCat) {
      return chapterCat.children.cache.find(
        (c): c is TextChannel => c.name === 'announcements' && c.isTextBased(),
      ) ?? null;
    }
  }

  return null;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild || !interaction.member) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
    return;
  }

  const guildMember = interaction.member as GuildMember;
  await interaction.deferReply({ ephemeral: true });

  const isSEB = guildMember.roles.cache.some((r) => r.name === ROLES.SEB);

  // Find which chapter(s) this member is CEB for
  const cebChapters: string[] = [];
  for (const ch of CHAPTER_NUMBERS) {
    if (guildMember.roles.cache.some((r) => r.name === ROLES.ceb(ch))) {
      cebChapters.push(ch);
    }
  }

  if (!isSEB && cebChapters.length === 0) {
    await interaction.editReply(
      'You must be a CEB or SEB member to use this command.',
    );
    return;
  }

  const title = interaction.options.getString('title', true);
  const message = interaction.options.getString('message', true);
  const scope = interaction.options.getString('scope'); // optional: 'state' | 'chapter'

  // Determine which announcements channel to post to.
  const currentChannel = interaction.channel;
  let targetChannel: TextChannel | null = null;

  // --- Explicit scope selection ---
  if (scope === 'state') {
    if (!isSEB) {
      await interaction.editReply('Only SEB members can post state-level announcements.');
      return;
    }
    const stateCat = interaction.guild.channels.cache.find(
      (c): c is CategoryChannel =>
        c.type === ChannelType.GuildCategory &&
        c.name === CATEGORIES.STATE_ANNOUNCEMENTS,
    );
    if (stateCat) {
      targetChannel = stateCat.children.cache.find(
        (c): c is TextChannel => c.name === 'announcements' && c.isTextBased(),
      ) ?? null;
    }
  } else if (scope === 'chapter') {
    // Explicit chapter scope — detect from current channel or single CEB chapter
    targetChannel = findChapterAnnouncementsChannel(interaction, isSEB, cebChapters);
  } else {
    // --- Auto-detect based on context ---

    // If inside the state announcements category and user is SEB, post there
    if (
      isSEB &&
      currentChannel &&
      'parent' in currentChannel &&
      currentChannel.parent?.name === CATEGORIES.STATE_ANNOUNCEMENTS
    ) {
      const parent = currentChannel.parent;
      if (parent.type === ChannelType.GuildCategory) {
        targetChannel = parent.children.cache.find(
          (c): c is TextChannel => c.name === 'announcements' && c.isTextBased(),
        ) ?? null;
      }
    }

    // If inside a chapter category, post to that chapter's announcements
    if (!targetChannel) {
      targetChannel = findChapterAnnouncementsChannel(interaction, isSEB, cebChapters);
    }

    // Fallback for SEB not in any specific category: post to state announcements
    if (!targetChannel && isSEB) {
      const stateCat = interaction.guild.channels.cache.find(
        (c): c is CategoryChannel =>
          c.type === ChannelType.GuildCategory &&
          c.name === CATEGORIES.STATE_ANNOUNCEMENTS,
      );
      if (stateCat) {
        targetChannel = stateCat.children.cache.find(
          (c): c is TextChannel => c.name === 'announcements' && c.isTextBased(),
        ) ?? null;
      }
    }
  }

  if (!targetChannel) {
    await interaction.editReply(
      'Could not determine which announcements channel to post to. ' +
      'Try using the `scope` option to specify state or chapter, ' +
      'or run this command from within the relevant category.',
    );
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(message)
    .setColor(0xdc143c)
    .setAuthor({
      name: interaction.user.displayName,
      iconURL: interaction.user.displayAvatarURL(),
    })
    .setTimestamp();

  // Determine which role to ping based on the target channel's category
  let pingContent = '';
  const parentName = targetChannel.parent?.name || '';

  if (parentName === CATEGORIES.STATE_ANNOUNCEMENTS) {
    // State announcement — ping all verified members
    const verifiedRole = interaction.guild.roles.cache.find((r) => r.name === ROLES.VERIFIED);
    if (verifiedRole) pingContent = verifiedRole.toString();
  } else {
    // Chapter announcement — ping the chapter role
    for (const ch of CHAPTER_NUMBERS) {
      if (parentName.includes(ch)) {
        const chRole = interaction.guild.roles.cache.find((r) => r.name === ROLES.chapter(ch));
        if (chRole) pingContent = chRole.toString();
        break;
      }
    }
  }

  await targetChannel.send({ content: pingContent || undefined, embeds: [embed] });

  await interaction.editReply(
    `Announcement posted to ${targetChannel.toString()}!`,
  );

  logger.info(
    `Announcement posted by ${interaction.user.tag} to #${targetChannel.name}: "${title}"`,
  );
}
