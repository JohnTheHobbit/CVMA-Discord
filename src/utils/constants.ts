/** Chapter numbers — 48-1 through 48-9 */
export const CHAPTER_NUMBERS = [
  '48-1', '48-2', '48-3', '48-4', '48-5',
  '48-6', '48-7', '48-8', '48-9',
] as const;

export type ChapterNumber = (typeof CHAPTER_NUMBERS)[number];

/** Role names */
export const ROLES = {
  STATE_REP: 'State Rep',
  SEB: 'SEB',
  VERIFIED: 'Verified',
  FULL_MEMBER: 'Full Member',
  AUXILIARY: 'Auxiliary',
  SUPPORT: 'Support',
  SUPPORT_AUXILIARY: 'Support Auxiliary',
  OFFICER_COMMANDER: 'Commander',
  OFFICER_SECRETARY: 'Secretary',
  OFFICER_TREASURER: 'Treasurer',
  OFFICER_SAA: 'Sergeant at Arms',
  OFFICER_PRO: 'PRO',
  OFFICER_CHAPLAIN: 'Chaplain',
  ceb: (ch: string) => `CEB ${ch}`,
  chapter: (ch: string) => `Ch ${ch}`,
} as const;

/** Role colors (Discord hex integers) */
export const ROLE_COLORS = {
  STATE_REP: 0xffd700,   // Gold
  SEB: 0xdc143c,          // Crimson red
  CEB: 0x4169e1,          // Royal blue
  CHAPTER: 0x2e8b57,      // Sea green
  FULL_MEMBER: 0x808080,  // Gray
  AUXILIARY: 0x808080,
  SUPPORT: 0x808080,
  SUPPORT_AUXILIARY: 0x808080,
  VERIFIED: 0x808080,
  OFFICER: 0x9b59b6,     // Purple
} as const;

/** Category names */
export const CATEGORIES = {
  WELCOME: '📌 WELCOME',
  STATE_ANNOUNCEMENTS: '📢 STATE ANNOUNCEMENTS',
  STATE_GENERAL: '🏍️ STATE GENERAL',
  EVENTS_RIDES: '📅 EVENTS & RIDES',
  SEB: '🔒 SEB',
  STATE_AUX: '🔸 STATE AUX',
  STATE_FM: '🔹 STATE FM/SUP',
  OFFICER_CHANNELS: '🎖️ OFFICER CHANNELS',
  chapter: (ch: string) => `🟢 CHAPTER ${ch}`,
} as const;

/** AirTable Member Type → Discord role name mapping */
export const MEMBER_TYPE_MAP: Record<string, string> = {
  FM: ROLES.FULL_MEMBER,
  AUX: ROLES.AUXILIARY,
  SUP: ROLES.SUPPORT,
  SAUX: ROLES.SUPPORT_AUXILIARY,
};

/** Interaction custom IDs for verification flow */
export const VERIFY_BUTTON_ID = 'cvma-verify-button';
export const VERIFY_MODAL_ID = 'cvma-verify-modal';
export const EMAIL_INPUT_ID = 'cvma-verify-email';

/** OTP verification flow custom IDs */
export const OTP_ENTER_CODE_BUTTON_ID = 'cvma-otp-enter-code';
export const OTP_CODE_MODAL_ID = 'cvma-otp-code-modal';
export const OTP_CODE_INPUT_ID = 'cvma-otp-code-input';

/** Officer title abbreviations for Discord nicknames (case-insensitive match) */
export const TITLE_ABBREVIATIONS: Record<string, string> = {
  'chapter commander': 'CC',
  'chapter executive officer': 'CXO',
  'chapter secretary': 'CSEC',
  'chapter treasurer': 'CTRES',
  'chapter sergeant at arms': 'CSAA',
  'chapter public relations officer': 'CPRO',
  'state representative': 'SR',
  'state sergeant at arms': 'SSAA',
  'state secretary': 'SSEC',
  'state treasurer': 'STRES',
  'state public relations officer': 'SPRO',
  'auxiliary state representative': 'ASR',
  'state chaplain': 'SCHAP',
  'chapter chaplain': 'CCHAP',
};

/** Map from AirTable title (lowercased) to officer role name */
export const TITLE_TO_OFFICER_ROLE: Record<string, string> = {
  'chapter commander': ROLES.OFFICER_COMMANDER,
  'chapter executive officer': ROLES.OFFICER_COMMANDER,
  'state representative': ROLES.OFFICER_COMMANDER,
  'chapter secretary': ROLES.OFFICER_SECRETARY,
  'state secretary': ROLES.OFFICER_SECRETARY,
  'chapter treasurer': ROLES.OFFICER_TREASURER,
  'state treasurer': ROLES.OFFICER_TREASURER,
  'chapter sergeant at arms': ROLES.OFFICER_SAA,
  'state sergeant at arms': ROLES.OFFICER_SAA,
  'chapter public relations officer': ROLES.OFFICER_PRO,
  'state public relations officer': ROLES.OFFICER_PRO,
  'chapter chaplain': ROLES.OFFICER_CHAPLAIN,
  'state chaplain': ROLES.OFFICER_CHAPLAIN,
};

/** All officer role names (for managed role set in sync) */
export const OFFICER_ROLE_NAMES = [
  ROLES.OFFICER_COMMANDER,
  ROLES.OFFICER_SECRETARY,
  ROLES.OFFICER_TREASURER,
  ROLES.OFFICER_SAA,
  ROLES.OFFICER_PRO,
  ROLES.OFFICER_CHAPLAIN,
] as const;

/** Event RSVP button custom ID prefixes */
export const EVT_RSVP_GOING_PREFIX = 'evt-rsvp-going-';
export const EVT_RSVP_MAYBE_PREFIX = 'evt-rsvp-maybe-';
export const EVT_RSVP_CANT_PREFIX = 'evt-rsvp-cant-';
export const EVT_POLL_PREFIX = 'evt-poll-';

/** Event embed color */
export const EVENT_EMBED_COLOR = 0x1abc9c; // Teal

/** AirTable field names */
export const AIRTABLE_FIELDS = {
  MID: 'MID',
  EMAIL: 'Email',
  FIRST_NAME: 'First Name',
  LAST_NAME: 'Last Name',
  ROAD_NAME: 'Road Name',
  MEMBER_TYPE: 'Member Type',
  CHAPTER: 'Chapter',
  TITLE: 'Title',
  MEMBER_STATUS: 'Member Status',
  DISCORD_ID: 'Discord ID',
  DISCORD_VERIFIED_DATE: 'Discord Verified Date',
} as const;
