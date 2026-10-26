/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

export const RETENTION_DAYS = 90;
export const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

/** How often the cleanup runs. Retention is the promise; this is the resolution. */
export const CLEANUP_INTERVAL_MICROS = 60n * 60n * 1_000_000n; // hourly

/**
 * Fixed-window counter rate limiting for send_message reducer to prevent chat flooding (FEAT-0375).
 * Allows a burst of up to RATE_LIMIT_MAX_MESSAGES within a fixed window of RATE_LIMIT_WINDOW_MS.
 */
export const RATE_LIMIT_WINDOW_MS = 10_000; // 10-second fixed window
export const RATE_LIMIT_MAX_MESSAGES = 5;   // max 5 messages per fixed window

/** Throttles the public cleanup reducer; see `handleDeleteExpiredMessages`. */
export const CLEANUP_ACTIVITY_SENDER = '__cleanup__';
export const CLEANUP_MIN_INTERVAL_MS = Number(CLEANUP_INTERVAL_MICROS / 1000n);

/**
 * Global floor (BUG-0726). SpacetimeDB issues an identity to any connection,
 * so a per-sender limit is bypassed by reconnecting. This one is keyed on a
 * reserved row in the same table rather than on the caller's identity.
 *
 * The key cannot collide with a real sender: identities are 64 hex characters.
 */
export const GLOBAL_RATE_LIMIT_WINDOW_MS = 60_000;
// 180 per fixed minute, not 60: a 60 ceiling is only twelve per-sender windows,
// so two identities could starve every other user with one message per second.
// This still bounds a flood while leaving room for normal multi-user traffic.
// The availability trade-off is documented in docs/GLOBAL-CHAT.md §8.
export const GLOBAL_RATE_LIMIT_MAX_MESSAGES = 180;
export const GLOBAL_RATE_LIMIT_SENDER = '__global__';

export interface SenderActivityRecord {
  sender: string;
  window_start: number;
  count: number;
  last_sent_at: number;
}

export type RateLimitDecision =
  | { action: 'insert'; record: SenderActivityRecord }
  | { action: 'update'; record: SenderActivityRecord }
  | { action: 'reject'; error: string };

/**
 * Evaluates the fixed-window rate limit for a sender given a message timestamp.
 * Pure function so both SpacetimeDB server reducers and unit tests share identical behavior.
 */
export function evaluateRateLimit(
  senderId: string,
  timestamp: number,
  activity: SenderActivityRecord | undefined,
  windowMs: number = RATE_LIMIT_WINDOW_MS,
  maxMessages: number = RATE_LIMIT_MAX_MESSAGES
): RateLimitDecision {
  if (!activity) {
    return {
      action: 'insert',
      record: {
        sender: senderId,
        window_start: timestamp,
        count: 1,
        last_sent_at: timestamp,
      },
    };
  }

  if (timestamp - activity.window_start >= windowMs) {
    return {
      action: 'update',
      record: {
        ...activity,
        window_start: timestamp,
        count: 1,
        last_sent_at: timestamp,
      },
    };
  }

  if (activity.count >= maxMessages) {
    return {
      action: 'reject',
      error: `Rate limit exceeded: maximum ${maxMessages} messages per ${windowMs / 1000}s`,
    };
  }

  return {
    action: 'update',
    record: {
      ...activity,
      count: activity.count + 1,
      last_sent_at: timestamp,
    },
  };
}

export const MAX_MESSAGE_LENGTH = 1000;

/**
 * One-line chat text (BUG-0726).
 *
 * Control characters, bidi controls, zero-width characters and blank glyphs
 * (braille blank, Hangul fillers) become a space; runs of whitespace collapse
 * and the edges are trimmed. The set is explicit rather than all of `\p{Cf}`:
 * ZWJ/ZWNJ (U+200C/U+200D) must survive so emoji clusters and joining scripts
 * still render.
 *
 * Bidi overrides (U+202A–U+202E, U+2066–U+2069) are removed because they let a
 * sender reorder or spoof the visible text. A result with no visible character
 * is returned as an empty string, which the caller rejects. Braille blank
 * (U+2800) and the Hangul fillers (U+115F/U+1160) are `So`/`Lo`, so the class
 * check alone would accept them as visible; they are in the removal set for
 * exactly that reason.
 */
const INVISIBLE_OR_CONTROL =
  /[\p{Cc}\u00AD\u061C\u115F\u1160\u180E\u200B\u200E\u200F\u202A-\u202E\u2028\u2029\u2060-\u2064\u2066-\u2069\u2800\u3164\uFEFF\uFFA0\uFFF9-\uFFFB]/gu;

/** At least one glyph a reader can see; combining marks alone do not count. */
const VISIBLE_CHARACTER = /[\p{L}\p{N}\p{P}\p{S}]/u;

export function sanitizeMessageText(text: string): string {
  const collapsed = text
    .replace(INVISIBLE_OR_CONTROL, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return VISIBLE_CHARACTER.test(collapsed) ? collapsed : '';
}

export interface GlobalMessageRecord {
  sender: string;
  text: string;
  sent_at: number;
}

export interface MessageDb {
  globalMessage: {
    insert(row: GlobalMessageRecord): void;
    delete(row: GlobalMessageRecord): void;
    iter(): Iterable<GlobalMessageRecord>;
  };
  senderActivity: {
    find(sender: string): SenderActivityRecord | undefined;
    insert(row: SenderActivityRecord): void;
    update(row: SenderActivityRecord): void;
    delete(row: SenderActivityRecord): void;
    iter(): Iterable<SenderActivityRecord>;
  };
}

/**
 * Writes a non-rejecting decision. A rejection here is a caller bug: it must
 * already have been thrown with its specific message, so dropping it silently
 * would hide the failure.
 */
function applyActivity(db: MessageDb, decision: RateLimitDecision): void {
  if (decision.action === 'reject') {
    throw new Error(decision.error);
  }
  if (decision.action === 'insert') db.senderActivity.insert(decision.record);
  else db.senderActivity.update(decision.record);
}

/**
 * Handles message validation, rate limiting, and insertion into the database.
 * Thrown errors are surfaced to the caller (e.g. SenderError in SpacetimeDB).
 */
export function handleSendMessage(
  db: MessageDb,
  senderId: string,
  timestamp: number,
  text: string,
): void {
  // Cheap early bound before the regex pass: a reducer argument far above the
  // message cap cannot become a valid message, so it is rejected without
  // scanning it character by character.
  if (text.length > MAX_MESSAGE_LENGTH * 4) {
    throw new Error('Message too long');
  }

  const sanitized = sanitizeMessageText(text);
  if (sanitized.length === 0) {
    throw new Error('Message cannot be empty');
  }
  if (sanitized.length > MAX_MESSAGE_LENGTH) {
    throw new Error('Message too long');
  }

  const senderDecision = evaluateRateLimit(
    senderId,
    timestamp,
    db.senderActivity.find(senderId),
  );
  if (senderDecision.action === 'reject') {
    throw new Error(senderDecision.error);
  }

  // Evaluated before either counter is written, so a global rejection does not
  // consume the sender's budget or vice versa.
  const globalDecision = evaluateRateLimit(
    GLOBAL_RATE_LIMIT_SENDER,
    timestamp,
    db.senderActivity.find(GLOBAL_RATE_LIMIT_SENDER),
    GLOBAL_RATE_LIMIT_WINDOW_MS,
    GLOBAL_RATE_LIMIT_MAX_MESSAGES,
  );
  if (globalDecision.action === 'reject') {
    throw new Error('Global chat rate limit exceeded: too many messages; try again shortly');
  }

  applyActivity(db, senderDecision);
  applyActivity(db, globalDecision);

  db.globalMessage.insert({
    sender: senderId,
    text: sanitized,
    sent_at: timestamp,
  });
}

/**
 * Deletes global messages and sender activity older than the retention window.
 */
export function handleDeleteExpiredMessages(
  db: MessageDb,
  nowMs: number,
  minIntervalMs: number = CLEANUP_MIN_INTERVAL_MS,
): { deletedMessages: number; deletedActivities: number } {
  // The reducer is public: any client can call it. Without this marker an
  // attacker could force a full-table scan in a loop; with it, at most one
  // scan per interval runs. The timestamp comes from `ctx.timestamp`, so a
  // client cannot move it (BUG-0726 review).
  const cleanupMarker = db.senderActivity.find(CLEANUP_ACTIVITY_SENDER);
  if (
    cleanupMarker &&
    nowMs - cleanupMarker.last_sent_at < minIntervalMs
  ) {
    return { deletedMessages: 0, deletedActivities: 0 };
  }

  const cutoff = nowMs - RETENTION_MS;
  let deletedMessages = 0;
  let deletedActivities = 0;

  for (const message of [...db.globalMessage.iter()]) {
    if (message.sent_at < cutoff) {
      db.globalMessage.delete(message);
      deletedMessages++;
    }
  }

  for (const activity of [...db.senderActivity.iter()]) {
    if (activity.last_sent_at < cutoff) {
      db.senderActivity.delete(activity);
      deletedActivities++;
    }
  }

  const marker: SenderActivityRecord = {
    sender: CLEANUP_ACTIVITY_SENDER,
    window_start: nowMs,
    count: 1,
    last_sent_at: nowMs,
  };
  // Re-read: the retention loop above may have deleted the old marker.
  if (db.senderActivity.find(CLEANUP_ACTIVITY_SENDER)) {
    db.senderActivity.update(marker);
  } else {
    db.senderActivity.insert(marker);
  }

  return { deletedMessages, deletedActivities };
}

/**
 * Deletes all messages and activity for a given sender (GDPR right to erasure).
 */
export function handleDeleteMyMessages(
  db: MessageDb,
  senderId: string,
): { deletedMessages: number; deletedActivities: number } {
  let deletedMessages = 0;
  let deletedActivities = 0;

  for (const message of [...db.globalMessage.iter()]) {
    if (message.sender === senderId) {
      db.globalMessage.delete(message);
      deletedMessages++;
    }
  }

  for (const activity of [...db.senderActivity.iter()]) {
    if (activity.sender === senderId) {
      db.senderActivity.delete(activity);
      deletedActivities++;
    }
  }

  return { deletedMessages, deletedActivities };
}
