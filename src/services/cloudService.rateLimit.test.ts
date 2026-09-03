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

import { describe, it, expect } from "vitest";
import {
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_MESSAGES,
  RETENTION_MS,
  MAX_MESSAGE_LENGTH,
  evaluateRateLimit,
  handleSendMessage,
  handleDeleteExpiredMessages,
  handleDeleteMyMessages,
  type SenderActivityRecord,
  type GlobalMessageRecord,
  type MessageDb,
} from "../../server/spacetimedb/src/rateLimit";

/**
 * FEAT-0375: Rate-limiting the send_message reducer in Global Chat.
 *
 * Tests the shared reducer operations and pure rate-limiting logic:
 * - 5 messages per 10-second fixed window (burst budget).
 * - 6th message within the same fixed window is rejected.
 * - Senders are isolated: one sender exceeding the budget does not block another.
 * - Fixed window reset: once 10 seconds elapse, the sender can send again.
 * - Inactive sender records past the 90-day retention window are pruned.
 * - GDPR erasure (delete_my_messages) deletes the sender activity row and messages.
 * - Text length validation (max 1000 characters).
 */

function createInMemoryDb() {
  const senderActivity = new Map<string, SenderActivityRecord>();
  let globalMessage: GlobalMessageRecord[] = [];

  const db: MessageDb = {
    globalMessage: {
      insert: (row) => globalMessage.push(row),
      delete: (row) => {
        globalMessage = globalMessage.filter((m) => m !== row);
      },
      iter: () => [...globalMessage],
    },
    senderActivity: {
      find: (sender) => senderActivity.get(sender),
      insert: (row) => senderActivity.set(row.sender, row),
      update: (row) => senderActivity.set(row.sender, row),
      delete: (row) => senderActivity.delete(row.sender),
      iter: () => [...senderActivity.values()],
    },
  };

  return {
    db,
    senderActivity,
    get globalMessage() {
      return globalMessage;
    },
  };
}

describe("FEAT-0375: evaluateRateLimit pure function", () => {
  it("returns insert decision on first message from sender", () => {
    const decision = evaluateRateLimit("sender_1", 10_000, undefined);
    expect(decision).toEqual({
      action: "insert",
      record: {
        sender: "sender_1",
        window_start: 10_000,
        count: 1,
        last_sent_at: 10_000,
      },
    });
  });

  it("increments count within the fixed window", () => {
    const existing: SenderActivityRecord = {
      sender: "sender_1",
      window_start: 10_000,
      count: 2,
      last_sent_at: 11_000,
    };
    const decision = evaluateRateLimit("sender_1", 12_000, existing);
    expect(decision).toEqual({
      action: "update",
      record: {
        sender: "sender_1",
        window_start: 10_000,
        count: 3,
        last_sent_at: 12_000,
      },
    });
  });

  it("rejects when count reaches max messages within the same fixed window", () => {
    const existing: SenderActivityRecord = {
      sender: "sender_1",
      window_start: 10_000,
      count: 5,
      last_sent_at: 14_000,
    };
    const decision = evaluateRateLimit("sender_1", 19_999, existing);
    expect(decision.action).toBe("reject");
    if (decision.action === "reject") {
      expect(decision.error).toContain("Rate limit exceeded");
    }
  });

  it("resets the fixed window once 10 seconds elapse and allows message", () => {
    const existing: SenderActivityRecord = {
      sender: "sender_1",
      window_start: 10_000,
      count: 5,
      last_sent_at: 14_000,
    };
    // At exactly 10_000 + 10_000 = 20_000, new fixed window begins
    const decision = evaluateRateLimit("sender_1", 20_000, existing);
    expect(decision).toEqual({
      action: "update",
      record: {
        sender: "sender_1",
        window_start: 20_000,
        count: 1,
        last_sent_at: 20_000,
      },
    });
  });
});

describe("FEAT-0375: send_message rate limiting reducer integration", () => {
  it("allows up to 5 messages within the 10-second fixed window (burst budget)", () => {
    const memDb = createInMemoryDb();
    const sender = "sender_alpha";
    const startTime = 1_000_000;

    for (let i = 0; i < RATE_LIMIT_MAX_MESSAGES; i++) {
      expect(() =>
        handleSendMessage(memDb.db, sender, startTime + i * 1000, `msg ${i + 1}`),
      ).not.toThrow();
    }

    expect(memDb.globalMessage).toHaveLength(5);
    const activity = memDb.senderActivity.get(sender);
    expect(activity?.count).toBe(5);
    expect(activity?.window_start).toBe(startTime);
  });

  it("rejects the 6th message within the same 10-second fixed window", () => {
    const memDb = createInMemoryDb();
    const sender = "sender_alpha";
    const startTime = 1_000_000;

    for (let i = 0; i < RATE_LIMIT_MAX_MESSAGES; i++) {
      handleSendMessage(memDb.db, sender, startTime + i * 1000, `msg ${i + 1}`);
    }

    // 6th message at 5 seconds into the window exceeds budget
    expect(() =>
      handleSendMessage(memDb.db, sender, startTime + 5000, "flooding attempt"),
    ).toThrow(/Rate limit exceeded: maximum 5 messages per 10s/);

    expect(memDb.globalMessage).toHaveLength(5);
  });

  it("rejects messages exceeding MAX_MESSAGE_LENGTH (1000 characters)", () => {
    const memDb = createInMemoryDb();
    const sender = "sender_alpha";
    const longText = "x".repeat(MAX_MESSAGE_LENGTH + 1);

    expect(() =>
      handleSendMessage(memDb.db, sender, 1_000_000, longText),
    ).toThrow("Message too long");

    expect(memDb.globalMessage).toHaveLength(0);
  });

  it("isolates rate limits between distinct senders", () => {
    const memDb = createInMemoryDb();
    const senderA = "sender_alpha";
    const senderB = "sender_beta";
    const startTime = 1_000_000;

    // Sender A exhausts their quota
    for (let i = 0; i < RATE_LIMIT_MAX_MESSAGES; i++) {
      handleSendMessage(memDb.db, senderA, startTime + i * 1000, `A msg ${i + 1}`);
    }
    expect(() =>
      handleSendMessage(memDb.db, senderA, startTime + 5000, "A exceed"),
    ).toThrow(/Rate limit exceeded/);

    // Sender B can still send freely
    expect(() =>
      handleSendMessage(memDb.db, senderB, startTime + 5000, "B msg 1"),
    ).not.toThrow();
    expect(memDb.globalMessage).toHaveLength(6);
  });

  it("resets the budget after the fixed 10-second window elapses", () => {
    const memDb = createInMemoryDb();
    const sender = "sender_alpha";
    const startTime = 1_000_000;

    // 5 messages in first window
    for (let i = 0; i < RATE_LIMIT_MAX_MESSAGES; i++) {
      handleSendMessage(memDb.db, sender, startTime + i * 1000, `msg ${i + 1}`);
    }

    // Next window at startTime + 10_000 ms
    const nextWindowTime = startTime + RATE_LIMIT_WINDOW_MS;
    expect(() =>
      handleSendMessage(memDb.db, sender, nextWindowTime, "new window msg"),
    ).not.toThrow();

    expect(memDb.globalMessage).toHaveLength(6);
    const activity = memDb.senderActivity.get(sender);
    expect(activity?.count).toBe(1);
    expect(activity?.window_start).toBe(nextWindowTime);
  });

  it("prunes inactive sender records past 90-day retention in delete_expired_messages", () => {
    const memDb = createInMemoryDb();
    const now = 200 * 24 * 60 * 60 * 1000; // day 200
    const oldTime = now - RETENTION_MS - 1000; // 91 days old
    const recentTime = now - 1000; // 1s ago

    memDb.senderActivity.set("old_user", {
      sender: "old_user",
      window_start: oldTime,
      count: 1,
      last_sent_at: oldTime,
    });
    memDb.senderActivity.set("active_user", {
      sender: "active_user",
      window_start: recentTime,
      count: 1,
      last_sent_at: recentTime,
    });

    handleDeleteExpiredMessages(memDb.db, now);

    expect(memDb.senderActivity.has("old_user")).toBe(false);
    expect(memDb.senderActivity.has("active_user")).toBe(true);
  });

  it("cleans up sender activity on delete_my_messages for GDPR compliance", () => {
    const memDb = createInMemoryDb();
    memDb.db.globalMessage.insert({ sender: "user_a", text: "msg A", sent_at: 1000 });
    memDb.db.globalMessage.insert({ sender: "user_b", text: "msg B", sent_at: 1000 });

    memDb.senderActivity.set("user_a", {
      sender: "user_a",
      window_start: 1000,
      count: 1,
      last_sent_at: 1000,
    });
    memDb.senderActivity.set("user_b", {
      sender: "user_b",
      window_start: 1000,
      count: 1,
      last_sent_at: 1000,
    });

    handleDeleteMyMessages(memDb.db, "user_a");

    expect(memDb.globalMessage).toHaveLength(1);
    expect(memDb.globalMessage[0].sender).toBe("user_b");
    expect(memDb.senderActivity.has("user_a")).toBe(false);
    expect(memDb.senderActivity.has("user_b")).toBe(true);
  });
});
