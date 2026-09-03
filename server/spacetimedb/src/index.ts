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

import { schema, table, t, SenderError } from 'spacetimedb/server';
import { ScheduleAt } from 'spacetimedb';

/**
 * Message retention, per docs/GLOBAL-CHAT.md section 4.
 *
 * A chat is a conversation, not an archive: nothing in the product reads
 * messages older than the visible history. Keeping them would mean holding
 * personal data with no purpose, which is what the GDPR consequence named in
 * ADR-0001 is about.
 */
import {
  RETENTION_DAYS,
  CLEANUP_INTERVAL_MICROS,
  type MessageDb,
  handleSendMessage,
  handleDeleteExpiredMessages,
  handleDeleteMyMessages,
} from './rateLimit';

const SenderActivity = table(
  { name: 'sender_activity' },
  {
    sender: t.string().primaryKey(),
    window_start: t.number(),
    count: t.number(),
    last_sent_at: t.number(),
  }
);

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

export const spacetimedb = schema(GlobalMessage, MessageCleanupSchedule, SenderActivity);

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function adaptDb(ctx: { db: any }): MessageDb {
  return {
    globalMessage: {
      insert: (row) => ctx.db.globalMessage.insert(row),
      delete: (row) => ctx.db.globalMessage.delete(row),
      iter: () => ctx.db.globalMessage.iter(),
    },
    senderActivity: {
      find: (sender) => ctx.db.senderActivity.sender.find(sender),
      insert: (row) => ctx.db.senderActivity.insert(row),
      update: (row) => ctx.db.senderActivity.sender.update(row),
      delete: (row) => ctx.db.senderActivity.delete(row),
      iter: () => ctx.db.senderActivity.iter(),
    },
  };
}

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
    const { deletedMessages } = handleDeleteExpiredMessages(adaptDb(ctx), nowMs);

    if (deletedMessages > 0) {
      console.info(`Retention: deleted ${deletedMessages} message(s) older than ${RETENTION_DAYS} days`);
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
  const senderId = ctx.sender.toHexString();
  const { deletedMessages } = handleDeleteMyMessages(adaptDb(ctx), senderId);
  console.info(`Erasure: deleted ${deletedMessages} message(s)`);
});

spacetimedb.clientConnected((ctx) => {
  console.info(`Client connected: ${ctx.sender}`);
});

spacetimedb.clientDisconnected((ctx) => {
  console.info(`Client disconnected: ${ctx.sender}`);
});

// Reducer to send a message
spacetimedb.reducer('send_message', { text: t.string() }, (ctx, { text }) => {
  const senderId = ctx.sender.toHexString();
  const timestamp = Number(ctx.timestamp.microsSinceUnixEpoch / 1000n);

  try {
    handleSendMessage(adaptDb(ctx), senderId, timestamp, text);
  } catch (err) {
    throw new SenderError(err instanceof Error ? err.message : String(err));
  }
});
