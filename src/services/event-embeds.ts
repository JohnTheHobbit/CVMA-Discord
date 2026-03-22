import {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  MessageActionRowComponentBuilder,
} from 'discord.js';
import { EventRecord, RsvpRecord, TimePollOption } from './database';
import {
  EVT_RSVP_GOING_PREFIX,
  EVT_RSVP_MAYBE_PREFIX,
  EVT_RSVP_CANT_PREFIX,
  EVT_POLL_PREFIX,
  EVENT_EMBED_COLOR,
  CHAPTER_NUMBERS,
} from '../utils/constants';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatScopeLabel(scope: string): string {
  if (scope === 'state') return 'State-Wide';
  for (const ch of CHAPTER_NUMBERS) {
    if (scope === ch) return `Chapter ${ch}`;
  }
  return scope;
}

function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Chicago',
    timeZoneName: 'short',
  });
}

/** Build a name list string, truncating if it would exceed maxLen chars. */
function nameList(names: string[], maxLen: number): string {
  if (names.length === 0) return '*None*';
  let result = '';
  let shown = 0;
  for (const name of names) {
    const entry = shown === 0 ? name : `, ${name}`;
    if (result.length + entry.length + 20 > maxLen) {
      const remaining = names.length - shown;
      result += ` *(and ${remaining} more)*`;
      break;
    }
    result += entry;
    shown++;
  }
  return result;
}

// ─── Event Embeds ───────────────────────────────────────────────────────────

export function buildEventEmbed(event: EventRecord, rsvps: RsvpRecord[]): EmbedBuilder {
  const going = rsvps.filter((r) => r.status === 'going').map((r) => r.user_display_name);
  const maybe = rsvps.filter((r) => r.status === 'maybe').map((r) => r.user_display_name);
  const cant = rsvps.filter((r) => r.status === 'cant').map((r) => r.user_display_name);

  const embed = new EmbedBuilder()
    .setTitle(event.title)
    .setColor(event.status === 'cancelled' ? 0x95a5a6 : EVENT_EMBED_COLOR)
    .setTimestamp(new Date(event.created_at));

  if (event.status === 'cancelled') {
    embed.setTitle(`~~${event.title}~~ — CANCELLED`);
  }

  const lines: string[] = [];
  if (event.description) lines.push(event.description);
  lines.push('');
  lines.push(`**Date:** ${formatDate(event.event_date)}`);
  if (event.end_date) lines.push(`**End:** ${formatDate(event.end_date)}`);
  if (event.location) lines.push(`**Location:** ${event.location}`);
  lines.push(`**Scope:** ${formatScopeLabel(event.scope)}`);

  embed.setDescription(lines.join('\n'));

  // RSVP fields (each field has a 1024 char limit)
  embed.addFields(
    { name: `Going (${going.length})`, value: nameList(going, 900), inline: true },
    { name: `Maybe (${maybe.length})`, value: nameList(maybe, 900), inline: true },
    { name: `Can't Make It (${cant.length})`, value: nameList(cant, 900), inline: true },
  );

  embed.setFooter({ text: `Event ID: ${event.id.slice(0, 8)}` });

  return embed;
}

export function buildRsvpButtons(eventId: string): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${EVT_RSVP_GOING_PREFIX}${eventId}`)
      .setLabel('Going')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
    new ButtonBuilder()
      .setCustomId(`${EVT_RSVP_MAYBE_PREFIX}${eventId}`)
      .setLabel('Maybe')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🤔'),
    new ButtonBuilder()
      .setCustomId(`${EVT_RSVP_CANT_PREFIX}${eventId}`)
      .setLabel("Can't Make It")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('❌'),
  );
}

// ─── Time Poll Embeds ───────────────────────────────────────────────────────

export function buildTimePollEmbed(
  event: EventRecord,
  results: { option: TimePollOption; votes: string[]; voterNames: string[] }[],
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`Time Poll: ${event.title}`)
    .setColor(EVENT_EMBED_COLOR)
    .setDescription('Vote for the time(s) that work for you. Click again to remove your vote.')
    .setFooter({ text: `Event ID: ${event.id.slice(0, 8)}` });

  for (const { option, votes, voterNames } of results) {
    const bar = '█'.repeat(Math.min(votes.length, 20));
    const voters = voterNames.length > 0 ? `\n${nameList(voterNames, 800)}` : '';
    embed.addFields({
      name: `${option.label} (${votes.length} vote${votes.length !== 1 ? 's' : ''})`,
      value: `${bar || '▒'}${voters}`,
      inline: false,
    });
  }

  return embed;
}

export function buildTimePollButtons(
  options: TimePollOption[],
): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  // Discord allows max 5 buttons per row, max 5 rows
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  let currentRow = new ActionRowBuilder<MessageActionRowComponentBuilder>();
  let count = 0;

  for (const option of options) {
    if (count > 0 && count % 5 === 0) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder<MessageActionRowComponentBuilder>();
    }
    currentRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`${EVT_POLL_PREFIX}${option.id}`)
        .setLabel(option.label)
        .setStyle(ButtonStyle.Primary),
    );
    count++;
  }

  if (count > 0) rows.push(currentRow);
  return rows;
}
