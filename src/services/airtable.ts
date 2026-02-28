import Airtable from 'airtable';
import { config } from '../config';
import { AIRTABLE_FIELDS } from '../utils/constants';
import logger from '../utils/logger';

export interface MemberRecord {
  recordId: string;
  mid: string;
  email: string;
  firstName: string;
  lastName: string;
  roadName: string;
  memberType: string;
  chapter: string;
  title: string;
  memberStatus: string;
  discordId: string | null;
}

const base = new Airtable({ apiKey: config.airtable.apiKey }).base(config.airtable.baseId);
const table = base(config.airtable.tableName);

function toMemberRecord(record: Airtable.Record<Airtable.FieldSet>): MemberRecord {
  const fields = record.fields;
  return {
    recordId: record.id,
    mid: (fields[AIRTABLE_FIELDS.MID] as string) || '',
    email: (fields[AIRTABLE_FIELDS.EMAIL] as string) || '',
    firstName: (fields[AIRTABLE_FIELDS.FIRST_NAME] as string) || '',
    lastName: (fields[AIRTABLE_FIELDS.LAST_NAME] as string) || '',
    roadName: (fields[AIRTABLE_FIELDS.ROAD_NAME] as string) || '',
    memberType: (fields[AIRTABLE_FIELDS.MEMBER_TYPE] as string) || '',
    chapter: (fields[AIRTABLE_FIELDS.CHAPTER] as string) || '',
    title: (fields[AIRTABLE_FIELDS.TITLE] as string) || '',
    memberStatus: (fields[AIRTABLE_FIELDS.MEMBER_STATUS] as string) || '',
    discordId: (fields[AIRTABLE_FIELDS.DISCORD_ID] as string) || null,
  };
}

/** Look up a member by email address. Returns null if not found. */
export async function findMemberByEmail(email: string): Promise<MemberRecord | null> {
  const normalizedEmail = email.toLowerCase().trim();
  const formula = `LOWER({${AIRTABLE_FIELDS.EMAIL}}) = '${normalizedEmail.replace(/'/g, "\\'")}'`;

  try {
    const records = await table
      .select({ filterByFormula: formula, maxRecords: 1 })
      .firstPage();

    if (records.length === 0) return null;
    return toMemberRecord(records[0]);
  } catch (err) {
    logger.error(`AirTable lookup failed for email ${normalizedEmail}: ${err}`);
    throw err;
  }
}

/** Get all members that have a Discord ID linked. */
export async function getLinkedMembers(): Promise<MemberRecord[]> {
  const members: MemberRecord[] = [];
  const formula = `NOT({${AIRTABLE_FIELDS.DISCORD_ID}} = '')`;

  try {
    await table
      .select({ filterByFormula: formula })
      .eachPage((records, fetchNextPage) => {
        for (const record of records) {
          members.push(toMemberRecord(record));
        }
        fetchNextPage();
      });

    logger.info(`Fetched ${members.length} linked members from AirTable`);
    return members;
  } catch (err) {
    logger.error(`Failed to fetch linked members: ${err}`);
    throw err;
  }
}

/** Save a Discord user ID to a member's AirTable record. */
export async function linkDiscordId(recordId: string, discordId: string): Promise<void> {
  try {
    await table.update(recordId, {
      [AIRTABLE_FIELDS.DISCORD_ID]: discordId,
      [AIRTABLE_FIELDS.DISCORD_VERIFIED_DATE]: new Date().toISOString().split('T')[0],
    });
    logger.info(`Linked Discord ID ${discordId} to AirTable record ${recordId}`);
  } catch (err) {
    logger.error(`Failed to link Discord ID ${discordId}: ${err}`);
    throw err;
  }
}
