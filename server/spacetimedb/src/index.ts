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

import { schema, table, t } from 'spacetimedb/server';
import { ScheduleAt } from 'spacetimedb';

/**
 * Message retention, per docs/GLOBAL-CHAT.md section 4.
 *
 * A chat is a conversation, not an archive: nothing in the product reads
 * messages older than the visible history. Keeping them would mean holding
 * personal data with no purpose, which is what the GDPR consequence named in
 * ADR-0001 is about.
 */
const RETENTION_DAYS = 90;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

/** How often the cleanup runs. Retention is the promise; this is the resolution. */
const CLEANUP_INTERVAL_MICROS = 60n * 60n * 1_000_000n; // hourly

const GlobalMessage = table(
  { name: 'global_message' },
  {
    sender: t.string(),
    text: t.string(),
    sent_at: t.number(), // Timestamp
  }
);

const MessageCleanupSchedule = table(
  { name: 'message_cleanup_schedule', scheduled: 'delete_expired_messages' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

export const spacetimedb = schema(GlobalMessage, MessageCleanupSchedule);

spacetimedb.init((ctx) => {
  console.info('Module initialized');

  // Arm the recurring retention sweep. Without this row nothing expires, so a
  // module published before this change keeps its old messages until the first
  // init after republishing.
  ctx.db.messageCleanupSchedule.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.interval(CLEANUP_INTERVAL_MICROS),
  });
});

/**
 * Deletes messages past the retention window.
 *
 * Scheduled, so it is driven by the database rather than by a client — no
 * caller can skip it and none has to remember to run it.
 */
spacetimedb.reducer(
  'delete_expired_messages',
  { arg: MessageCleanupSchedule.rowType },
  (ctx) => {
    // ctx.timestamp rather than Date.now(): reducers must be deterministic.
    const nowMs = Number(ctx.timestamp.microsSinceUnixEpoch / 1000n);
    const cutoff = nowMs - RETENTION_MS;

    let deleted = 0;
    for (const message of [...ctx.db.globalMessage.iter()]) {
      if (message.sent_at < cutoff) {
        ctx.db.globalMessage.delete(message);
        deleted++;
      }
    }

    if (deleted > 0) {
      console.info(`Retention: deleted ${deleted} message(s) older than ${RETENTION_DAYS} days`);
    }
  }
);

/**
 * Deletes every message belonging to the caller — the GDPR right to erasure,
 * exercised by the person it belongs to rather than through the operator.
 *
 * The sender ID is derived from `ctx.sender`, never taken as an argument, so
 * one caller cannot erase another's messages.
 */
spacetimedb.reducer('delete_my_messages', {}, (ctx) => {
  const senderId = ctx.sender.toHexString().substring(0, 8);

  let deleted = 0;
  for (const message of [...ctx.db.globalMessage.iter()]) {
    if (message.sender === senderId) {
      ctx.db.globalMessage.delete(message);
      deleted++;
    }
  }

  console.info(`Erasure: deleted ${deleted} message(s) for ${senderId}`);
});

spacetimedb.clientConnected((ctx) => {
  console.info(`Client connected: ${ctx.sender}`);
});

spacetimedb.clientDisconnected((ctx) => {
  console.info(`Client disconnected: ${ctx.sender}`);
});

// Reducer to send a message
spacetimedb.reducer('send_message', { text: t.string() }, (ctx, { text }) => {
  if (text.length > 1000) {
    throw new Error('Message too long');
  }

  const senderId = ctx.sender.toHexString().substring(0, 8); // Short ID
  const timestamp = Date.now();

  console.info(`Message from ${senderId}: ${text}`);

  // Use globalMessage (camelCase) as required by SpacetimeDB Typescript bindings
  ctx.db.globalMessage.insert({
    sender: senderId,
    text: text,
    sent_at: timestamp
  });
});
