import { randomInt } from 'crypto';
import logger from '../utils/logger';

interface OtpEntry {
  code: string;
  email: string;
  guildId: string;
  expiresAt: number;
  attempts: number;
}

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 3;
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const otpStore = new Map<string, OtpEntry>();
const rateLimitStore = new Map<string, RateLimitEntry>();

export type ValidateSuccess = { valid: true; email: string; guildId: string };
export type ValidateFailure = { valid: false; reason: 'expired' | 'wrong_code' | 'too_many_attempts' | 'no_pending' };
export type ValidateResult = ValidateSuccess | ValidateFailure;

/**
 * Generate and store a 6-digit OTP for a user.
 * Returns the code string, or null if rate-limited.
 */
export function generateAndStore(userId: string, guildId: string, email: string): string | null {
  const emailLower = email.toLowerCase();

  // Check rate limit
  const rateEntry = rateLimitStore.get(emailLower);
  const now = Date.now();
  if (rateEntry) {
    if (now - rateEntry.windowStart < RATE_LIMIT_WINDOW_MS) {
      if (rateEntry.count >= RATE_LIMIT_MAX) {
        logger.warn(`OTP rate limit hit for email ${emailLower}`);
        return null;
      }
      rateEntry.count++;
    } else {
      rateEntry.count = 1;
      rateEntry.windowStart = now;
    }
  } else {
    rateLimitStore.set(emailLower, { count: 1, windowStart: now });
  }

  const code = randomInt(100000, 999999).toString();

  otpStore.set(userId, {
    code,
    email: emailLower,
    guildId,
    expiresAt: now + OTP_TTL_MS,
    attempts: 0,
  });

  logger.info(`OTP generated for user ${userId} (email: ${emailLower})`);
  return code;
}

/**
 * Validate an OTP code for a user.
 */
export function validate(userId: string, code: string): ValidateResult {
  const entry = otpStore.get(userId);

  if (!entry) {
    return { valid: false, reason: 'no_pending' };
  }

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(userId);
    return { valid: false, reason: 'expired' };
  }

  if (entry.attempts >= MAX_ATTEMPTS) {
    otpStore.delete(userId);
    return { valid: false, reason: 'too_many_attempts' };
  }

  if (entry.code !== code.trim()) {
    entry.attempts++;
    if (entry.attempts >= MAX_ATTEMPTS) {
      otpStore.delete(userId);
      return { valid: false, reason: 'too_many_attempts' };
    }
    return { valid: false, reason: 'wrong_code' };
  }

  // Success — remove the entry
  otpStore.delete(userId);
  return { valid: true, email: entry.email, guildId: entry.guildId };
}

/** Remove a pending OTP (e.g., on email send failure). */
export function remove(userId: string): void {
  otpStore.delete(userId);
}

/** Periodic cleanup of expired entries. */
function cleanup(): void {
  const now = Date.now();

  for (const [userId, entry] of otpStore) {
    if (now > entry.expiresAt) {
      otpStore.delete(userId);
    }
  }

  for (const [email, entry] of rateLimitStore) {
    if (now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
      rateLimitStore.delete(email);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanup, 5 * 60 * 1000).unref();
