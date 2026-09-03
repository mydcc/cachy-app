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
 * Handles message validation, rate limiting, and insertion into the database.
 * Thrown errors are surfaced to the caller (e.g. SenderError in SpacetimeDB).
 */
export function handleSendMessage(
  db: MessageDb,
  senderId: string,
  timestamp: number,
  text: string,
): void {
  if (text.length > MAX_MESSAGE_LENGTH) {
    throw new Error('Message too long');
  }

  const activity = db.senderActivity.find(senderId);
  const decision = evaluateRateLimit(senderId, timestamp, activity);

  if (decision.action === 'reject') {
    throw new Error(decision.error);
  } else if (decision.action === 'insert') {
    db.senderActivity.insert(decision.record);
  } else if (decision.action === 'update') {
    db.senderActivity.update(decision.record);
  }

  db.globalMessage.insert({
    sender: senderId,
    text,
    sent_at: timestamp,
  });
}

/**
 * Deletes global messages and sender activity older than the retention window.
 */
export function handleDeleteExpiredMessages(
  db: MessageDb,
  nowMs: number,
): { deletedMessages: number; deletedActivities: number } {
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
