# CVMA Minnesota Discord Bot — Beta Testing Guide

Thank you for helping beta test the CVMA Minnesota Discord server and bot! This guide walks you through what to test and what to look for.

---

## Getting Started

1. Join the Discord server using the invite link https://cvmamn.org/discord
2. When you first join, you should only see two channels: `#welcome` and `#verify`
3. All other channels are hidden until you complete verification

---

## Test 1: Verification Flow (Button)

This is the primary way members will verify.

1. Go to the `#verify` channel
2. You should see a message from the bot with a green **"Click to Verify"** button
3. Click the button — a popup should appear asking for your email
4. Enter the email address associated with your **combatvet.us** account
5. The bot should reply (only visible to you) saying a verification code has been sent
6. Check your email for a message from the bot with a **6-digit code**
7. Click the **"Enter Code"** button in the bot's reply
8. Enter the 6-digit code in the popup

**Expected results after successful verification:**
- [ ] You receive a confirmation message listing your assigned roles
- [ ] Your server nickname changes to your Road Name (or First Last) - Chapter - Title (if officer)
- [ ] You can now see your chapter's channels (e.g., `CHAPTER 48-4`)
- [ ] You can see state-level channels (State Announcements, State General, Events & Rides)
- [ ] A welcome message appears in `#introductions` with your name, chapter, and member type
- [ ] If you are AUX/SAUX: you can see the `STATE AUX` category
- [ ] If you are FM/SUP: you can see the `STATE FM/SUP` category

---

## Test 2: Verification Flow (Slash Command)

This is a fallback method.

> **Note:** If you already verified in Test 1, you can skip this test. It's mainly for confirming the slash command still works.

1. In the `#verify` channel, type `/verify`
2. Discord should show an autocomplete for the command
3. Enter your email and submit
4. You should receive the same OTP email and "Enter Code" button flow as Test 1

---

## Test 3: Channel Visibility & Permissions

After verification, check the following:

### State Channels
- [ ] You can see and read `#announcements` in STATE ANNOUNCEMENTS
- [ ] You can see and post in `#general-chat` in STATE GENERAL
- [ ] You can see `#introductions` and `#photos-and-media`
- [ ] You **cannot** post in `#announcements` (read-only for non-SEB)

### Your Chapter Channels
- [ ] You can see your chapter's category (e.g., `CHAPTER 48-4`)
- [ ] You can post in your chapter's `#general` channel
- [ ] You can read your chapter's `#announcements` but **cannot** post (CEB/SEB only)
- [ ] You **cannot** see `#ceb-only` (unless you are CEB or SEB)

### Other Chapters
- [ ] You **cannot** see other chapters' channels (e.g., if you're in 48-4, you shouldn't see 48-1's channels)

### Member Type Channels
- [ ] **AUX/SAUX members:** You can see and post in your chapter's `#aux-chat` and `STATE AUX` channels
- [ ] **FM/SUP members:** You can see and post in your chapter's `#fm-chat` and `STATE FM/SUP` channels
- [ ] You can read but **cannot** post in the opposite type's chat (e.g., FM can read `#aux-chat` but not post)

### SEB Members Only
- [ ] You can see the `SEB` category with `#seb-discussion`, `#seb-drafts`, `#seb-bot-log`
- [ ] You can see all chapter channels across all 9 chapters

---

## Test 4: Mobile Testing

If you have the Discord mobile app:

1. Open the `#verify` channel on your phone
2. Tap the **"Click to Verify"** button — the email popup should appear
3. Complete the full OTP flow from your phone
4. Confirm the "Enter Code" button and code popup work on mobile

---

## Test 5: Error Cases

Try these to make sure the bot handles errors gracefully:

- [ ] **Wrong email:** Enter an email that doesn't exist in the system — you should get a clear error message
- [ ] **Wrong code:** Enter an incorrect 6-digit code — you should get "Incorrect code. Please try again."
- [ ] **Expired code:** Wait more than 10 minutes before entering the code — you should get an expiration message
- [ ] **Double verify:** Try to verify again after already being verified — it should still work (re-assigns same roles)

---

## Test 6: Voice Channels

- [ ] You can join your chapter's `chapter-hangout` voice channel
- [ ] You can join the `general-hangout` voice channel in STATE GENERAL
- [ ] You **cannot** join `ceb-meeting` voice (unless you are CEB or SEB)

---

## Test 7: Announcements (CEB/SEB Only)

If you are a CEB or SEB member:

1. Type `/announce` in your chapter's channel
2. Enter a test title and message
3. The announcement should appear in your chapter's `#announcements` channel

**SEB members only:**
- [ ] Run `/announce` with `scope: State` — it should post to the state `#announcements` channel
- [ ] Run `/announce` from a non-chapter channel without specifying scope — it should default to state announcements

---

## Reporting Issues

Post your feedback, issues, and questions in the `#beta-testers` channel on Discord. When reporting an issue, please include:

1. **What you were doing** (e.g., "Clicked the Verify button and entered my email")
2. **What you expected** (e.g., "Should have received an email with a code")
3. **What actually happened** (e.g., "Got an error message saying verification failed")
4. **Platform** (Desktop, Web, or Mobile)
5. **Screenshot** if possible

If you're comfortable with GitHub, you can also open issues directly on the repo: https://github.com/JohnTheHobbit/CVMA-Discord/issues — but this is optional. The State Rep will track issues from the `#beta-testers` channel as well.

---

## Important Notes

- Your verification code expires after **10 minutes** — if it expires, just click the Verify button again to get a new one
- You can only request **3 codes per hour** per email address to prevent abuse
- If you get "This membership is already linked to a different Discord account," contact the State Rep
- The bot syncs with AirTable every 6 hours — if your roles seem wrong, they'll correct on the next sync
