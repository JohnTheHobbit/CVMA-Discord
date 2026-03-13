import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  GuildMember,
  TextChannel,
  EmbedBuilder,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
} from 'discord.js';
import {
  createEvent,
  getEvent,
  cancelEvent,
  getUpcomingEvents,
  getRsvps,
  updateEventMessageId,
  updateEventGcalId,
  updateDiscordEventId,
  updateEventDate,
  createTimePollOption,
  getTimePollResults,
} from '../services/database';
import { pushEventToGCal, deleteGCalEvent, updateGCalEvent } from '../services/google-calendar';
import {
  buildEventEmbed,
  buildRsvpButtons,
  buildTimePollEmbed,
  buildTimePollButtons,
} from '../services/event-embeds';
import { CHAPTER_NUMBERS, ROLES, EVENT_EMBED_COLOR } from '../utils/constants';
import logger from '../utils/logger';

// ─── Slash command definition ───────────────────────────────────────────────

export const data = new SlashCommandBuilder()
  .setName('event')
  .setDescription('Manage CVMA events')
  .addSubcommand((sub) =>
    sub
      .setName('create')
      .setDescription('Create a new event')
      .addStringOption((opt) =>
        opt.setName('title').setDescription('Event title').setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName('date')
          .setDescription('Event date/time (YYYY-MM-DD HH:MM, Central Time)')
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName('scope')
          .setDescription('State or chapter scope')
          .setRequired(true)
          .addChoices(
            { name: 'State', value: 'state' },
            ...CHAPTER_NUMBERS.map((ch) => ({
              name: `Chapter ${ch}`,
              value: ch,
            })),
          ),
      )
      .addStringOption((opt) =>
        opt.setName('description').setDescription('Event description').setRequired(false),
      )
      .addStringOption((opt) =>
        opt
          .setName('end-date')
          .setDescription('End date/time (YYYY-MM-DD HH:MM, Central Time)')
          .setRequired(false),
      )
      .addStringOption((opt) =>
        opt.setName('location').setDescription('Event location').setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('cancel')
      .setDescription('Cancel an event')
      .addStringOption((opt) =>
        opt.setName('event-id').setDescription('Event ID (from embed footer)').setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('list')
      .setDescription('List upcoming events')
      .addStringOption((opt) =>
        opt
          .setName('scope')
          .setDescription('Filter by scope')
          .setRequired(false)
          .addChoices(
            { name: 'All', value: 'all' },
            { name: 'State', value: 'state' },
            ...CHAPTER_NUMBERS.map((ch) => ({
              name: `Chapter ${ch}`,
              value: ch,
            })),
          ),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('poll')
      .setDescription('Create a time poll for an event')
      .addStringOption((opt) =>
        opt.setName('event-id').setDescription('Event ID (from embed footer)').setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName('option1').setDescription('Time option 1 (e.g., "Sat 3/15 2:00 PM")').setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName('option2').setDescription('Time option 2').setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName('option3').setDescription('Time option 3').setRequired(false),
      )
      .addStringOption((opt) =>
        opt.setName('option4').setDescription('Time option 4').setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('pick-time')
      .setDescription('Select the winning time from a poll')
      .addStringOption((opt) =>
        opt.setName('event-id').setDescription('Event ID (from embed footer)').setRequired(true),
      )
      .addIntegerOption((opt) =>
        opt
          .setName('option')
          .setDescription('Option number to select (1-4)')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(4),
      ),
  );

// ─── Permission check ──────────────────────────────────────────────────────

function checkEventPermission(
  member: GuildMember,
  scope: string,
): { allowed: boolean; reason?: string } {
  const isSEB = member.roles.cache.some((r) => r.name === ROLES.SEB);

  if (scope === 'state') {
    if (!isSEB) return { allowed: false, reason: 'Only SEB members can create state events.' };
    return { allowed: true };
  }

  // Chapter scope
  if (isSEB) return { allowed: true };

  const isCEB = member.roles.cache.some((r) => r.name === ROLES.ceb(scope));
  if (!isCEB) {
    return {
      allowed: false,
      reason: `You must be a CEB member of Chapter ${scope} or SEB to create events for this chapter.`,
    };
  }
  return { allowed: true };
}

// ─── Date parsing ───────────────────────────────────────────────────────────

/**
 * Parse a date string in "YYYY-MM-DD HH:MM" format as Central Time.
 * Returns ISO 8601 string or null if invalid.
 */
function parseCentralDate(input: string): string | null {
  const match = input.trim().match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;

  // Build a date string with explicit Central Time offset
  // We use Intl to determine if it's CDT (-05:00) or CST (-06:00)
  const testDate = new Date(`${year}-${month}-${day}T${hour.padStart(2, '0')}:${minute}:00`);
  if (isNaN(testDate.getTime())) return null;

  // Format using Intl to get the correct offset for that date
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'shortOffset',
  });

  // Determine offset by checking what UTC offset Central Time has on this date
  const parts = formatter.formatToParts(testDate);
  const offsetPart = parts.find((p) => p.type === 'timeZoneName');
  const offsetStr = offsetPart?.value || 'GMT-6';

  // Parse offset like "GMT-5" or "GMT-6" into ISO format
  const offsetMatch = offsetStr.match(/GMT([+-]\d+)/);
  let isoOffset = '-06:00';
  if (offsetMatch) {
    const hrs = parseInt(offsetMatch[1], 10);
    isoOffset = `${hrs >= 0 ? '+' : '-'}${String(Math.abs(hrs)).padStart(2, '0')}:00`;
  }

  return `${year}-${month}-${day}T${hour.padStart(2, '0')}:${minute}:00${isoOffset}`;
}

// ─── Subcommand handlers ────────────────────────────────────────────────────

async function handleCreate(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild!;
  const member = interaction.member as GuildMember;

  const title = interaction.options.getString('title', true);
  const dateStr = interaction.options.getString('date', true);
  const scope = interaction.options.getString('scope', true);
  const description = interaction.options.getString('description') || '';
  const endDateStr = interaction.options.getString('end-date') || '';
  const location = interaction.options.getString('location') || '';

  // Permission check
  const perm = checkEventPermission(member, scope);
  if (!perm.allowed) {
    await interaction.editReply(perm.reason!);
    return;
  }

  // Parse dates
  const eventDate = parseCentralDate(dateStr);
  if (!eventDate) {
    await interaction.editReply(
      'Invalid date format. Please use `YYYY-MM-DD HH:MM` (e.g., `2026-04-15 14:00`).',
    );
    return;
  }

  let endDate = '';
  if (endDateStr) {
    const parsed = parseCentralDate(endDateStr);
    if (!parsed) {
      await interaction.editReply(
        'Invalid end date format. Please use `YYYY-MM-DD HH:MM` (e.g., `2026-04-15 16:00`).',
      );
      return;
    }
    endDate = parsed;
  }

  // Create in database
  const event = createEvent({
    title,
    description,
    location,
    eventDate,
    endDate,
    scope,
    createdBy: interaction.user.id,
  });

  // Find #event-calendar channel
  const eventChannel = guild.channels.cache.find(
    (c) => c.name === 'event-calendar' && c.isTextBased(),
  ) as TextChannel | undefined;

  if (!eventChannel) {
    await interaction.editReply(
      'Event created but could not find #event-calendar channel. Run `/setup-server` to create it.',
    );
    return;
  }

  // Build and post the event embed
  const rsvps = getRsvps(event.id);
  const embed = buildEventEmbed(event, rsvps);
  const buttons = buildRsvpButtons(event.id);

  // Ping the relevant role
  let pingContent = '';
  if (scope === 'state') {
    const verifiedRole = guild.roles.cache.find((r) => r.name === ROLES.VERIFIED);
    if (verifiedRole) pingContent = verifiedRole.toString();
  } else {
    const chRole = guild.roles.cache.find((r) => r.name === ROLES.chapter(scope));
    if (chRole) pingContent = chRole.toString();
  }

  const msg = await eventChannel.send({
    content: pingContent || undefined,
    embeds: [embed],
    components: [buttons],
  });

  updateEventMessageId(event.id, eventChannel.id, msg.id);

  // Push to Google Calendar
  const gcalId = await pushEventToGCal(event);
  if (gcalId) {
    updateEventGcalId(event.id, gcalId);
  }

  // Create Discord Scheduled Event
  try {
    const scopeLabel = scope === 'state' ? 'CVMA MN State' : `CVMA MN Chapter ${scope}`;
    const scheduledStart = new Date(eventDate);
    const scheduledEnd = endDate ? new Date(endDate) : new Date(scheduledStart.getTime() + 60 * 60 * 1000);

    const discordEvent = await guild.scheduledEvents.create({
      name: title,
      description: `${description}\n\nScope: ${scopeLabel}`.trim(),
      scheduledStartTime: scheduledStart,
      scheduledEndTime: scheduledEnd,
      privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
      entityType: location
        ? GuildScheduledEventEntityType.External
        : GuildScheduledEventEntityType.External,
      entityMetadata: { location: location || scopeLabel },
    });

    updateDiscordEventId(event.id, discordEvent.id);
    logger.info(`Discord Scheduled Event created: ${discordEvent.id}`);
  } catch (err) {
    logger.warn(`Could not create Discord Scheduled Event: ${err}`);
  }

  await interaction.editReply(
    `Event **${title}** created and posted to ${eventChannel.toString()}! (ID: \`${event.id.slice(0, 8)}\`)`,
  );

  logger.info(
    `Event created by ${interaction.user.tag}: "${title}" (${scope}) on ${eventDate} [${event.id.slice(0, 8)}]`,
  );
}

async function handleCancel(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild!;
  const member = interaction.member as GuildMember;
  const inputId = interaction.options.getString('event-id', true).trim();

  // Support both short (8-char) and full UUIDs
  const allEvents = getUpcomingEvents();
  const event = allEvents.find((e) => e.id === inputId || e.id.startsWith(inputId));

  if (!event) {
    await interaction.editReply('Event not found. Make sure you entered the correct Event ID.');
    return;
  }

  if (event.status === 'cancelled') {
    await interaction.editReply('This event is already cancelled.');
    return;
  }

  // Permission: creator, SEB, or CEB for the event's chapter
  const isSEB = member.roles.cache.some((r) => r.name === ROLES.SEB);
  const isCreator = event.created_by === interaction.user.id;
  const isCEB = event.scope !== 'state' && member.roles.cache.some((r) => r.name === ROLES.ceb(event.scope));

  if (!isCreator && !isSEB && !isCEB) {
    await interaction.editReply('You do not have permission to cancel this event.');
    return;
  }

  cancelEvent(event.id);

  // Remove from Google Calendar
  if (event.gcal_event_id) {
    await deleteGCalEvent(event.gcal_event_id);
  }

  // Cancel Discord Scheduled Event
  if (event.discord_event_id) {
    try {
      const scheduledEvent = await guild.scheduledEvents.fetch(event.discord_event_id);
      if (scheduledEvent) {
        await scheduledEvent.delete();
        logger.info(`Discord Scheduled Event deleted: ${event.discord_event_id}`);
      }
    } catch (err) {
      logger.warn(`Could not delete Discord Scheduled Event: ${err}`);
    }
  }

  // Update the embed in the channel
  if (event.channel_id && event.message_id) {
    try {
      const channel = guild.channels.cache.get(event.channel_id) as TextChannel | undefined;
      if (channel) {
        const msg = await channel.messages.fetch(event.message_id);
        const rsvps = getRsvps(event.id);
        const updatedEvent = getEvent(event.id)!;
        const embed = buildEventEmbed(updatedEvent, rsvps);
        await msg.edit({ embeds: [embed], components: [] });
      }
    } catch (err) {
      logger.warn(`Could not update cancelled event message: ${err}`);
    }
  }

  await interaction.editReply(`Event **${event.title}** has been cancelled.`);
  logger.info(`Event cancelled by ${interaction.user.tag}: "${event.title}" [${event.id.slice(0, 8)}]`);
}

async function handleList(interaction: ChatInputCommandInteraction): Promise<void> {
  const scopeFilter = interaction.options.getString('scope') || 'all';
  const events = scopeFilter === 'all'
    ? getUpcomingEvents()
    : getUpcomingEvents(scopeFilter);

  if (events.length === 0) {
    await interaction.editReply('No upcoming events found.');
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('Upcoming Events')
    .setColor(EVENT_EMBED_COLOR);

  const lines = events.slice(0, 25).map((e) => {
    const date = new Date(e.event_date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Chicago',
    });
    const scopeLabel = e.scope === 'state' ? 'State' : `Ch ${e.scope}`;
    const rsvpCount = getRsvps(e.id).filter((r) => r.status === 'going').length;
    return `**${e.title}** — ${date} (${scopeLabel}) — ${rsvpCount} going — ID: \`${e.id.slice(0, 8)}\``;
  });

  embed.setDescription(lines.join('\n'));

  if (events.length > 25) {
    embed.setFooter({ text: `Showing 25 of ${events.length} events` });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handlePoll(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild!;
  const member = interaction.member as GuildMember;
  const inputId = interaction.options.getString('event-id', true).trim();

  const allEvents = getUpcomingEvents();
  const evt = allEvents.find((e) => e.id === inputId || e.id.startsWith(inputId));

  if (!evt) {
    await interaction.editReply('Event not found.');
    return;
  }

  // Permission: creator, SEB, or CEB for event's scope
  const isSEB = member.roles.cache.some((r) => r.name === ROLES.SEB);
  const isCreator = evt.created_by === interaction.user.id;
  const isCEB = evt.scope !== 'state' && member.roles.cache.some((r) => r.name === ROLES.ceb(evt.scope));

  if (!isCreator && !isSEB && !isCEB) {
    await interaction.editReply('You do not have permission to create a poll for this event.');
    return;
  }

  // Gather options
  const optionLabels: string[] = [];
  for (let i = 1; i <= 4; i++) {
    const val = interaction.options.getString(`option${i}`);
    if (val) optionLabels.push(val);
  }

  if (optionLabels.length < 2) {
    await interaction.editReply('You need at least 2 time options.');
    return;
  }

  // Create poll options in DB
  const pollOptions = optionLabels.map((label) =>
    createTimePollOption(evt.id, label, label),
  );

  // Find #event-planning channel
  const planningChannel = guild.channels.cache.find(
    (c) => c.name === 'event-planning' && c.isTextBased(),
  ) as TextChannel | undefined;

  if (!planningChannel) {
    await interaction.editReply('Could not find #event-planning channel.');
    return;
  }

  // Build and post poll embed
  const results = pollOptions.map((opt) => ({ option: opt, votes: [] as string[], voterNames: [] as string[] }));
  const embed = buildTimePollEmbed(evt, results);
  const buttonRows = buildTimePollButtons(pollOptions);

  await planningChannel.send({ embeds: [embed], components: buttonRows });

  await interaction.editReply(
    `Time poll for **${evt.title}** posted to ${planningChannel.toString()}!`,
  );
  logger.info(`Time poll created for event "${evt.title}" [${evt.id.slice(0, 8)}]`);
}

async function handlePickTime(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild!;
  const member = interaction.member as GuildMember;
  const inputId = interaction.options.getString('event-id', true).trim();
  const optionNum = interaction.options.getInteger('option', true);

  const allEvents = getUpcomingEvents();
  const evt = allEvents.find((e) => e.id === inputId || e.id.startsWith(inputId));

  if (!evt) {
    await interaction.editReply('Event not found.');
    return;
  }

  // Permission check
  const isSEB = member.roles.cache.some((r) => r.name === ROLES.SEB);
  const isCreator = evt.created_by === interaction.user.id;
  const isCEB = evt.scope !== 'state' && member.roles.cache.some((r) => r.name === ROLES.ceb(evt.scope));

  if (!isCreator && !isSEB && !isCEB) {
    await interaction.editReply('You do not have permission to pick a time for this event.');
    return;
  }

  const results = getTimePollResults(evt.id);
  if (results.length === 0) {
    await interaction.editReply('No time poll found for this event. Create one with `/event poll` first.');
    return;
  }

  if (optionNum < 1 || optionNum > results.length) {
    await interaction.editReply(`Invalid option. Choose between 1 and ${results.length}.`);
    return;
  }

  const selected = results[optionNum - 1];
  const newDate = selected.option.time_option;

  // Update event date
  updateEventDate(evt.id, newDate);

  // Update the event embed if it exists
  if (evt.channel_id && evt.message_id) {
    try {
      const channel = guild.channels.cache.get(evt.channel_id) as TextChannel | undefined;
      if (channel) {
        const msg = await channel.messages.fetch(evt.message_id);
        const updatedEvent = getEvent(evt.id)!;
        const rsvps = getRsvps(evt.id);
        const embed = buildEventEmbed(updatedEvent, rsvps);
        const buttons = buildRsvpButtons(evt.id);
        await msg.edit({ embeds: [embed], components: [buttons] });
      }
    } catch (err) {
      logger.warn(`Could not update event message after pick-time: ${err}`);
    }
  }

  // Update Google Calendar
  const updatedEvt = getEvent(evt.id)!;
  if (updatedEvt.gcal_event_id) {
    await updateGCalEvent(updatedEvt.gcal_event_id, updatedEvt);
  }

  // Update Discord Scheduled Event
  if (updatedEvt.discord_event_id) {
    try {
      const scheduledEvent = await guild.scheduledEvents.fetch(updatedEvt.discord_event_id);
      if (scheduledEvent) {
        const newStart = new Date(updatedEvt.event_date);
        const newEnd = updatedEvt.end_date
          ? new Date(updatedEvt.end_date)
          : new Date(newStart.getTime() + 60 * 60 * 1000);
        await scheduledEvent.edit({
          scheduledStartTime: newStart,
          scheduledEndTime: newEnd,
        });
        logger.info(`Discord Scheduled Event updated: ${updatedEvt.discord_event_id}`);
      }
    } catch (err) {
      logger.warn(`Could not update Discord Scheduled Event: ${err}`);
    }
  }

  await interaction.editReply(
    `Time for **${evt.title}** set to: **${selected.option.label}**`,
  );
  logger.info(`Time picked for event "${evt.title}" [${evt.id.slice(0, 8)}]: ${selected.option.label}`);
}

// ─── Main execute ───────────────────────────────────────────────────────────

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild || !interaction.member) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const sub = interaction.options.getSubcommand();

  switch (sub) {
    case 'create':
      await handleCreate(interaction);
      break;
    case 'cancel':
      await handleCancel(interaction);
      break;
    case 'list':
      await handleList(interaction);
      break;
    case 'poll':
      await handlePoll(interaction);
      break;
    case 'pick-time':
      await handlePickTime(interaction);
      break;
    default:
      await interaction.editReply('Unknown subcommand.');
  }
}
