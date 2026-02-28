import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  TextChannel,
  EmbedBuilder,
  GuildMember,
  CategoryChannel,
  ChannelType,
} from 'discord.js';
import { CHAPTER_NUMBERS, ROLES } from '../utils/constants';
import logger from '../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('announce')
  .setDescription('Post a formatted announcement to your chapter\'s announcements channel')
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
  );

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

  // Determine which announcements channel to post to.
  // If the command is used inside a chapter category, post to that chapter's announcements.
  // Otherwise, if CEB of exactly one chapter, use that chapter's channel.
  const currentChannel = interaction.channel;
  let targetChannel: TextChannel | null = null;

  if (currentChannel && 'parent' in currentChannel && currentChannel.parent) {
    const categoryName = currentChannel.parent.name;
    // Check if we're inside a chapter category
    for (const ch of CHAPTER_NUMBERS) {
      if (categoryName.includes(ch)) {
        // Verify the user has CEB or SEB access to this chapter
        if (isSEB || cebChapters.includes(ch)) {
          const parent = currentChannel.parent;
          if (parent.type === ChannelType.GuildCategory) {
            targetChannel = parent.children.cache.find(
              (c): c is TextChannel => c.name === 'announcements' && c.isTextBased(),
            ) ?? null;
          }
        }
        break;
      }
    }
  }

  // Fallback: if CEB of exactly one chapter, use that
  if (!targetChannel && cebChapters.length === 1) {
    const chapterCat = interaction.guild.channels.cache.find(
      (c): c is CategoryChannel =>
        c.type === ChannelType.GuildCategory &&
        c.name.includes(cebChapters[0]) &&
        c.name.includes('CHAPTER'),
    );
    if (chapterCat) {
      targetChannel = chapterCat.children.cache.find(
        (c): c is TextChannel => c.name === 'announcements' && c.isTextBased(),
      ) ?? null;
    }
  }

  if (!targetChannel) {
    await interaction.editReply(
      'Could not determine which announcements channel to post to. ' +
      'Please run this command from within your chapter\'s channels.',
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

  await targetChannel.send({ embeds: [embed] });

  await interaction.editReply(
    `Announcement posted to ${targetChannel.toString()}!`,
  );

  logger.info(
    `Announcement posted by ${interaction.user.tag} to #${targetChannel.name}: "${title}"`,
  );
}
