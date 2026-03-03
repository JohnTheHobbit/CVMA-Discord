import {
  Guild,
  ChannelType,
  PermissionFlagsBits,
  Role,
  CategoryChannel,
  TextChannel,
  OverwriteResolvable,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  MessageActionRowComponentBuilder,
} from 'discord.js';
import {
  CHAPTER_NUMBERS,
  ROLES,
  ROLE_COLORS,
  CATEGORIES,
  VERIFY_BUTTON_ID,
} from '../utils/constants';
import logger from '../utils/logger';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Find an existing role by name or create it. */
async function ensureRole(
  guild: Guild,
  name: string,
  color: number,
  permissions: bigint[] = [],
  hoist = false,
): Promise<Role> {
  const existing = guild.roles.cache.find((r) => r.name === name);
  if (existing) {
    logger.debug(`Role "${name}" already exists`);
    return existing;
  }
  const role = await guild.roles.create({
    name,
    color,
    hoist,
    permissions,
    reason: 'CVMA server setup',
  });
  logger.info(`Created role: ${name}`);
  return role;
}

/** Find an existing category by name or create it. */
async function ensureCategory(
  guild: Guild,
  name: string,
  overwrites: OverwriteResolvable[],
): Promise<CategoryChannel> {
  const existing = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === name,
  ) as CategoryChannel | undefined;
  if (existing) {
    logger.debug(`Category "${name}" already exists`);
    return existing;
  }
  const category = await guild.channels.create({
    name,
    type: ChannelType.GuildCategory,
    permissionOverwrites: overwrites,
    reason: 'CVMA server setup',
  });
  logger.info(`Created category: ${name}`);
  return category;
}

/** Find an existing channel in a category by name or create it. */
async function ensureChannel(
  guild: Guild,
  name: string,
  type: ChannelType.GuildText | ChannelType.GuildVoice,
  parent: CategoryChannel,
  overwrites?: OverwriteResolvable[],
): Promise<void> {
  const existing = guild.channels.cache.find(
    (c) => c.name === name && c.parentId === parent.id,
  );
  if (existing) {
    logger.debug(`Channel "${name}" already exists in ${parent.name}`);
    return;
  }
  await guild.channels.create({
    name,
    type,
    parent: parent.id,
    permissionOverwrites: overwrites,
    reason: 'CVMA server setup',
  });
  logger.info(`Created channel: ${name} in ${parent.name}`);
}

// ─── Main Builder ───────────────────────────────────────────────────────────

interface ServerRoles {
  stateRep: Role;
  seb: Role;
  verified: Role;
  cebs: Map<string, Role>;
  chapters: Map<string, Role>;
  fullMember: Role;
  auxiliary: Role;
  support: Role;
  supportAux: Role;
}

/** Create all roles needed for the CVMA server. */
async function buildRoles(guild: Guild): Promise<ServerRoles> {
  // Highest-priority roles first
  const stateRep = await ensureRole(
    guild,
    ROLES.STATE_REP,
    ROLE_COLORS.STATE_REP,
    [PermissionFlagsBits.Administrator],
    true,
  );
  const seb = await ensureRole(
    guild,
    ROLES.SEB,
    ROLE_COLORS.SEB,
    [
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.MuteMembers,
      PermissionFlagsBits.DeafenMembers,
      PermissionFlagsBits.MoveMembers,
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.Speak,
    ],
    true,
  );

  const cebs = new Map<string, Role>();
  const chapters = new Map<string, Role>();

  for (const ch of CHAPTER_NUMBERS) {
    cebs.set(ch, await ensureRole(guild, ROLES.ceb(ch), ROLE_COLORS.CEB, [], true));
    chapters.set(ch, await ensureRole(guild, ROLES.chapter(ch), ROLE_COLORS.CHAPTER, [], true));
  }

  // Label roles (no special permissions, not hoisted)
  const fullMember = await ensureRole(guild, ROLES.FULL_MEMBER, ROLE_COLORS.FULL_MEMBER);
  const auxiliary = await ensureRole(guild, ROLES.AUXILIARY, ROLE_COLORS.AUXILIARY);
  const support = await ensureRole(guild, ROLES.SUPPORT, ROLE_COLORS.SUPPORT);
  const supportAux = await ensureRole(guild, ROLES.SUPPORT_AUXILIARY, ROLE_COLORS.SUPPORT_AUXILIARY);

  const verified = await ensureRole(guild, ROLES.VERIFIED, ROLE_COLORS.VERIFIED);

  return { stateRep, seb, verified, cebs, chapters, fullMember, auxiliary, support, supportAux };
}

/** Create all categories and channels. */
async function buildChannels(guild: Guild, roles: ServerRoles): Promise<void> {
  const everyone = guild.roles.everyone;

  // ── WELCOME ─────────────────────────────────────────────
  const welcomeCat = await ensureCategory(guild, CATEGORIES.WELCOME, [
    { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
  ]);
  await ensureChannel(guild, 'welcome', ChannelType.GuildText, welcomeCat, [
    { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
  ]);
  await ensureChannel(guild, 'verify', ChannelType.GuildText, welcomeCat, [
    {
      id: everyone.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.UseApplicationCommands,
      ],
      deny: [
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.AddReactions,
      ],
    },
  ]);

  // Post the persistent verify button message if one doesn't already exist
  const verifyChannel = guild.channels.cache.find(
    (c) => c.name === 'verify' && c.parentId === welcomeCat.id && c.isTextBased(),
  ) as TextChannel | undefined;

  if (verifyChannel) {
    const messages = await verifyChannel.messages.fetch({ limit: 10 });
    const hasVerifyButton = messages.some(
      (m) =>
        m.author.id === guild.client.user?.id &&
        m.components.length > 0,
    );

    if (!hasVerifyButton) {
      const embed = new EmbedBuilder()
        .setTitle('CVMA Minnesota — Membership Verification')
        .setDescription(
          'Welcome to the CVMA Minnesota Discord server!\n\n' +
          'To gain access to your chapter channels and state channels, ' +
          'please verify your membership by clicking the button below.\n\n' +
          'You will need the **email address** associated with your combatvet.us account.',
        )
        .setColor(0x2e8b57)
        .setFooter({ text: 'If you have issues, contact the State Rep for assistance.' });

      const button = new ButtonBuilder()
        .setCustomId(VERIFY_BUTTON_ID)
        .setLabel('Click to Verify')
        .setStyle(ButtonStyle.Success);

      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>()
        .addComponents(button);

      await verifyChannel.send({ embeds: [embed], components: [row] });
      logger.info('Posted verify button message in #verify');
    }
  }

  // ── STATE ANNOUNCEMENTS ─────────────────────────────────
  const annCat = await ensureCategory(guild, CATEGORIES.STATE_ANNOUNCEMENTS, [
    { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: roles.verified.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
    { id: roles.seb.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
  ]);
  await ensureChannel(guild, 'announcements', ChannelType.GuildText, annCat);
  await ensureChannel(guild, 'upcoming-votes', ChannelType.GuildText, annCat);
  await ensureChannel(guild, 'meeting-schedule', ChannelType.GuildText, annCat);

  // ── STATE GENERAL ───────────────────────────────────────
  const genCat = await ensureCategory(guild, CATEGORIES.STATE_GENERAL, [
    { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: roles.verified.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
  ]);
  await ensureChannel(guild, 'general-chat', ChannelType.GuildText, genCat);
  await ensureChannel(guild, 'introductions', ChannelType.GuildText, genCat);
  await ensureChannel(guild, 'photos-and-media', ChannelType.GuildText, genCat);
  await ensureChannel(guild, 'general-hangout', ChannelType.GuildVoice, genCat);

  // ── EVENTS & RIDES ──────────────────────────────────────
  const eventCat = await ensureCategory(guild, CATEGORIES.EVENTS_RIDES, [
    { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: roles.verified.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
  ]);
  await ensureChannel(guild, 'event-planning', ChannelType.GuildText, eventCat);
  await ensureChannel(guild, 'ride-planning', ChannelType.GuildText, eventCat);
  await ensureChannel(guild, 'event-calendar', ChannelType.GuildText, eventCat);
  await ensureChannel(guild, 'event-planning-voice', ChannelType.GuildVoice, eventCat);

  // ── SEB ─────────────────────────────────────────────────
  const sebCat = await ensureCategory(guild, CATEGORIES.SEB, [
    { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: roles.seb.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
  ]);
  await ensureChannel(guild, 'seb-discussion', ChannelType.GuildText, sebCat);
  await ensureChannel(guild, 'seb-drafts', ChannelType.GuildText, sebCat);
  await ensureChannel(guild, 'seb-bot-log', ChannelType.GuildText, sebCat);
  await ensureChannel(guild, 'seb-meeting', ChannelType.GuildVoice, sebCat);

  // ── CHAPTER CATEGORIES (one per chapter) ────────────────
  for (const ch of CHAPTER_NUMBERS) {
    const chRole = roles.chapters.get(ch)!;
    const cebRole = roles.cebs.get(ch)!;

    const chCat = await ensureCategory(guild, CATEGORIES.chapter(ch), [
      { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: chRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
        ],
      },
      {
        id: cebRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.MuteMembers,
          PermissionFlagsBits.DeafenMembers,
          PermissionFlagsBits.MoveMembers,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
        ],
      },
      {
        id: roles.seb.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
        ],
      },
    ]);

    // General chapter channel
    await ensureChannel(guild, 'general', ChannelType.GuildText, chCat);

    // Announcements — CEB can post, members read-only
    await ensureChannel(guild, 'announcements', ChannelType.GuildText, chCat, [
      { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: chRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
      { id: cebRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: roles.seb.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    ]);

    // CEB-only text channel
    await ensureChannel(guild, 'ceb-only', ChannelType.GuildText, chCat, [
      { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: chRole.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: cebRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: roles.seb.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    ]);

    // Voice channels
    await ensureChannel(guild, 'chapter-hangout', ChannelType.GuildVoice, chCat);

    // CEB-only voice
    await ensureChannel(guild, 'ceb-meeting', ChannelType.GuildVoice, chCat, [
      { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: chRole.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: cebRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
      { id: roles.seb.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
    ]);

    // Aux chat — all chapter members can read, only AUX + SAUX can post
    await ensureChannel(guild, 'aux-chat', ChannelType.GuildText, chCat, [
      { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: chRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
      { id: roles.auxiliary.id, allow: [PermissionFlagsBits.SendMessages] },
      { id: roles.supportAux.id, allow: [PermissionFlagsBits.SendMessages] },
      { id: cebRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] },
      { id: roles.seb.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    ]);

    // FM chat — all chapter members can read, only FM + SUP can post
    await ensureChannel(guild, 'fm-chat', ChannelType.GuildText, chCat, [
      { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: chRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
      { id: roles.fullMember.id, allow: [PermissionFlagsBits.SendMessages] },
      { id: roles.support.id, allow: [PermissionFlagsBits.SendMessages] },
      { id: cebRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] },
      { id: roles.seb.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    ]);
  }

  // ── STATE AUX ───────────────────────────────────────────
  const stateAuxCat = await ensureCategory(guild, CATEGORIES.STATE_AUX, [
    { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: roles.auxiliary.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
    { id: roles.supportAux.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
    { id: roles.seb.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ManageMessages] },
  ]);
  await ensureChannel(guild, 'aux-general', ChannelType.GuildText, stateAuxCat);
  await ensureChannel(guild, 'aux-hangout', ChannelType.GuildVoice, stateAuxCat);

  // ── STATE FM/SUP ────────────────────────────────────────
  const stateFmCat = await ensureCategory(guild, CATEGORIES.STATE_FM, [
    { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: roles.fullMember.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
    { id: roles.support.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
    { id: roles.seb.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ManageMessages] },
  ]);
  await ensureChannel(guild, 'fm-general', ChannelType.GuildText, stateFmCat);
  await ensureChannel(guild, 'fm-hangout', ChannelType.GuildVoice, stateFmCat);
}

/** Set up the role hierarchy ordering (highest position first). */
async function orderRoles(guild: Guild, roles: ServerRoles): Promise<void> {
  // Bot's highest role position limits where we can place roles.
  // We set positions relative to each other — highest number = highest in list.
  const botMember = guild.members.me;
  if (!botMember) return;

  const botHighest = botMember.roles.highest.position;
  // Place roles below the bot's highest role
  let pos = botHighest - 1;

  const updates: { role: string; position: number }[] = [];

  updates.push({ role: roles.stateRep.id, position: pos-- });
  updates.push({ role: roles.seb.id, position: pos-- });

  for (const ch of CHAPTER_NUMBERS) {
    updates.push({ role: roles.cebs.get(ch)!.id, position: pos-- });
  }
  for (const ch of CHAPTER_NUMBERS) {
    updates.push({ role: roles.chapters.get(ch)!.id, position: pos-- });
  }

  // Label roles and Verified at the bottom
  const labelRoles = [ROLES.FULL_MEMBER, ROLES.AUXILIARY, ROLES.SUPPORT, ROLES.SUPPORT_AUXILIARY, ROLES.VERIFIED];
  for (const name of labelRoles) {
    const role = guild.roles.cache.find((r) => r.name === name);
    if (role) updates.push({ role: role.id, position: pos-- });
  }

  try {
    await guild.roles.setPositions(updates);
    logger.info('Role hierarchy ordered successfully');
  } catch (err) {
    logger.warn(`Could not fully reorder roles (bot role may need to be higher): ${err}`);
  }
}

/** Run the full server setup — idempotent. */
export async function setupServer(guild: Guild): Promise<void> {
  logger.info(`Starting server setup for guild: ${guild.name}`);

  const roles = await buildRoles(guild);
  await buildChannels(guild, roles);
  await orderRoles(guild, roles);

  logger.info('Server setup complete');
}
