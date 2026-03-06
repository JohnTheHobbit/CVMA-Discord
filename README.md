# CVMA Minnesota Discord Bot

Discord bot for **Combat Veterans Motorcycle Association (CVMA) Minnesota** — manages server structure, role assignment, member verification, and AirTable-based membership sync across 9 chapters (48-1 through 48-9).

## Features

- **Member Verification with Email OTP** — Members click a "Click to Verify" button in `#verify`, enter their CVMA email, receive a 6-digit verification code via email, and enter it to complete verification. The bot assigns roles, sets their server nickname, and announces them in `#introductions`. The `/verify` slash command is also available as a fallback.
- **Automated Server Setup** — `/setup-server` creates all roles, categories, and channels with proper permission overwrites. Also posts the verification button in `#verify`. Idempotent — safe to run multiple times.
- **Role Sync** — Every 6 hours the bot syncs roles with AirTable. If a member's chapter, type, or officer status changes, their Discord roles update automatically. Inactive members have all managed roles removed. A summary is posted to `#seb-bot-log`.
- **Announcements** — `/announce` lets CEB post to their chapter's announcements channel and SEB post to the state-level announcements channel. Supports an optional `scope` parameter (State/Chapter).
- **Nickname Management** — On verification, members' server nicknames are set to `RoadName - Chapter` (e.g., `Hobbit - 48-4`) or `FirstName LastName - Chapter` if no road name. Officers get their title appended (e.g., `Hobbit - 48-4 - State Rep`).
- **Inactive Member Handling** — Members marked as "Inactive" in AirTable are blocked from verifying and have all managed roles stripped during role sync, removing access to all channels except `#welcome` and `#verify`.

## Verification Flow

1. Member joins the server and sees only the `#welcome` and `#verify` channels
2. In `#verify`, they click the **"Click to Verify"** button
3. A modal opens asking for their CVMA email address
4. The bot checks AirTable to confirm the member exists, is active, and isn't already linked to another Discord account
5. A 6-digit verification code is emailed to the member (valid for 10 minutes)
6. The member clicks **"Enter Code"** and enters the code in a second modal
7. On success: roles are assigned, nickname is set, and a welcome embed is posted in `#introductions`

Rate limiting: max 3 codes per email per hour, max 3 wrong attempts per code.

## Server Structure

### Roles

| Role | Purpose |
|------|---------|
| State Rep | Server administrator |
| SEB | State Executive Board — visibility into all chapters and state channels |
| CEB 48-X | Chapter Executive Board — moderation within their chapter |
| Ch 48-X | Chapter membership — access to chapter channels |
| Full Member | Member type label (FM) |
| Auxiliary | Member type label (AUX) |
| Support | Member type label (SUP) |
| Support Auxiliary | Member type label (SAUX) |
| Verified | Granted on successful verification — unlocks state-level channels |

### Categories & Channels

- **WELCOME** — `#welcome` (read-only info), `#verify` (button-based verification, no typing allowed)
- **STATE ANNOUNCEMENTS** — `#announcements`, `#upcoming-votes`, `#meeting-schedule` (SEB posts, verified members read)
- **STATE GENERAL** — `#general-chat`, `#introductions`, `#photos-and-media`, voice hangout
- **EVENTS & RIDES** — `#event-planning`, `#ride-planning`, `#event-calendar`, voice
- **SEB** — Private SEB discussion, drafts, bot log, voice meeting
- **STATE AUX** — Visible only to Auxiliary, Support Auxiliary, and SEB
- **STATE FM/SUP** — Visible only to Full Member, Support, and SEB
- **CHAPTER 48-X** (x9) — Each chapter has: `#general`, `#announcements`, `#ceb-only`, `#aux-chat`, `#fm-chat`, voice hangout, CEB voice meeting

## Tech Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript
- **Discord Library**: discord.js v14
- **Database**: AirTable (shared base with CVMA Login Automation)
- **Email**: Nodemailer with Google Workspace SMTP (for OTP verification)
- **Logging**: Winston with daily rotate file transport
- **Scheduling**: node-cron
- **Deployment**: Docker / Kubernetes

## Project Structure

```
src/
├── index.ts                 # Entry point — creates Discord client
├── config.ts                # Environment variable configuration
├── deploy-commands.ts       # Registers slash commands with Discord API
├── commands/
│   ├── verify.ts            # /verify — member verification + OTP helpers
│   ├── setup-server.ts      # /setup-server — server structure setup
│   └── announce.ts          # /announce — post announcements
├── services/
│   ├── airtable.ts          # AirTable client — lookup, sync, link
│   ├── email.ts             # Nodemailer SMTP — send verification codes
│   ├── otp-store.ts         # In-memory OTP storage with rate limiting
│   ├── server-builder.ts    # Roles, categories, channels, permissions
│   └── role-sync.ts         # Scheduled role sync with AirTable
├── events/
│   ├── ready.ts             # Bot startup + cron scheduling
│   ├── guildMemberAdd.ts    # New member join logging
│   └── interactionCreate.ts # Slash commands, buttons, and modal routing
└── utils/
    ├── constants.ts         # Chapter numbers, role names, categories, AirTable fields
    └── logger.ts            # Winston logger configuration
```

## Prerequisites

- Node.js 20+
- A Discord bot application with `bot` and `applications.commands` scopes, and `Administrator` permission
- An AirTable base with a members table containing the fields: `MID`, `Email`, `First Name`, `Last Name`, `Road Name`, `Member Type`, `Chapter`, `Title`, `Member Status`, `Discord ID`, `Discord Verified Date`
- A Google Workspace account with 2-Step Verification enabled and an App Password generated for SMTP

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd cvma-discord
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DISCORD_TOKEN` | Yes | — | Bot token from the Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Yes | — | Application ID from the Discord Developer Portal |
| `DISCORD_GUILD_ID` | Yes | — | Your Discord server's ID |
| `AIRTABLE_API_KEY` | Yes | — | AirTable Personal Access Token |
| `AIRTABLE_BASE_ID` | Yes | — | AirTable base ID (starts with `app`) |
| `AIRTABLE_TABLE_NAME` | No | `Members` | AirTable table name |
| `SMTP_USER` | Yes | — | Google Workspace email address |
| `SMTP_PASS` | Yes | — | Google App Password (requires 2-Step Verification) |
| `SMTP_HOST` | No | `smtp.gmail.com` | SMTP server hostname |
| `SMTP_PORT` | No | `587` | SMTP port |
| `SMTP_FROM` | No | `SMTP_USER` | From address for verification emails |
| `SYNC_CRON` | No | `0 */6 * * *` | Role sync schedule (cron expression) |
| `LOG_LEVEL` | No | `info` | Logging level |

### 3. Build and run

```bash
npm run build
npm run deploy-commands   # Register slash commands with Discord
npm start
```

### 4. Initial server setup

Run `/setup-server` in your Discord server (requires Administrator permission). This creates all roles, categories, channels, and posts the verification button in `#verify`.

## Docker

### Build and push

```bash
docker build -t registry.boydclan.org/cvma-discord-bot:latest .
docker push registry.boydclan.org/cvma-discord-bot:latest
```

### Run standalone

```bash
docker run --env-file .env cvma-discord-bot
```

To register slash commands in a running container:

```bash
docker exec <container-id> node dist/deploy-commands.js
```

## Kubernetes

K8s manifests are maintained in a separate repository and deployed via ArgoCD. The deployment uses:

- A `cvma-discord` namespace
- A Secret for environment variables
- A single-replica Deployment with `Recreate` strategy
- Image: `registry.boydclan.org/cvma-discord-bot:latest`

To register slash commands in K8s:

```bash
kubectl exec -it -n cvma-discord $(kubectl get pod -n cvma-discord -o jsonpath='{.items[0].metadata.name}') -- node dist/deploy-commands.js
```

To restart the pod after a new image push (ArgoCD-compatible):

```bash
kubectl delete pod -l app=cvma-discord-bot -n cvma-discord
```

## Slash Commands

### `/verify`

**Usage**: `/verify email:<email>`
Initiates the email OTP verification flow. The bot checks AirTable, sends a 6-digit code to the member's email, and replies with an "Enter Code" button. On successful code entry:
- Assigns Verified, Chapter, Member Type, and officer roles
- Sets server nickname (e.g., `Hobbit - 48-4 - State Rep`)
- Links Discord ID in AirTable
- Posts a welcome embed in `#introductions`

### `/setup-server`

**Usage**: `/setup-server`
Creates all roles, categories, and channels with proper permissions. Posts the verification button in `#verify`. Idempotent — skips anything that already exists. Requires Administrator permission.

### `/announce`

**Usage**: `/announce title:<title> message:<message> [scope:State|Chapter]`
Posts a formatted announcement embed. CEB members post to their chapter's `#announcements` channel. SEB members can post to the state-level `#announcements` channel (defaults to state when not in a chapter category).

## AirTable Fields

| Field | Type | Purpose |
|-------|------|---------|
| MID | Text | Member ID |
| Email | Email | Used for verification lookup (case-insensitive) |
| First Name | Text | Display name / nickname fallback |
| Last Name | Text | Display name / nickname fallback |
| Road Name | Text | Nickname / callsign — used as primary display name |
| Member Type | Text | `FM`, `AUX`, `SUP`, or `SAUX` |
| Chapter | Text | Contains chapter number (e.g., `48-4`) |
| Title | Text | Officer title — `State ...` = SEB, `Chapter ...` = CEB |
| Member Status | Text | `Active` or `Inactive` — inactive members lose all roles |
| Discord ID | Text | Linked by the bot on verification |
| Discord Verified Date | Date | Set by the bot on verification |

## Role Sync Behavior

The bot runs a role sync on the cron schedule (default: every 6 hours):

1. Fetches all AirTable records that have a Discord ID linked
2. For each member, calculates the expected roles based on their current AirTable data
3. Adds missing roles and removes roles that should no longer be assigned
4. **Inactive members** have all managed roles stripped, removing access to all channels except `#welcome` and `#verify`
5. Posts a summary embed to `#seb-bot-log`

## License

UNLICENSED — Private project for CVMA Minnesota.
