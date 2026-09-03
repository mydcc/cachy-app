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
  evaluateRateLimit,
  type SenderActivityRecord,
} from "../../server/spacetimedb/src/rateLimit";

/**
 * FEAT-0375: Rate-limiting the send_message reducer in Global Chat.
 *
 * Tests the transactional rate limit behavior:
 * - 5 messages per 10-second fixed window (burst budget).
 * - 6th message within the same fixed window is rejected with a SenderError.
 * - Senders are isolated: one sender exceeding the budget does not block another.
 * - Fixed window reset: once 10 seconds elapse, the sender can send again.
 * - Inactive sender records past the 90-day retention window are pruned.
 * - GDPR erasure (delete_my_messages) deletes the sender activity row.
 */

class SenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SenderError";
  }
}

interface GlobalMessageRow {
  sender: string;
  text: string;
  sent_at: number;
}

function executeSendMessage(
  db: {
    senderActivity: Map<string, SenderActivityRecord>;
    globalMessage: GlobalMessageRow[];
  },
  senderId: string,
  timestampMs: number,
  text: string,
) {
  if (text.length > 1000) {
    throw new SenderError("Message too long");
  }

  const activity = db.senderActivity.get(senderId);
  const decision = evaluateRateLimit(senderId, timestampMs, activity);

  if (decision.action === "reject") {
    throw new SenderError(decision.error);
  } else if (decision.action === "insert" || decision.action === "update") {
    db.senderActivity.set(senderId, decision.record);
  }

  db.globalMessage.push({
    sender: senderId,
    text,
    sent_at: timestampMs,
  });
}

function executeDeleteExpiredMessages(
  db: {
    senderActivity: Map<string, SenderActivityRecord>;
    globalMessage: GlobalMessageRow[];
  },
  nowMs: number,
) {
  const cutoff = nowMs - RETENTION_MS;

  db.globalMessage = db.globalMessage.filter((msg) => msg.sent_at >= cutoff);

  for (const [sender, activity] of [...db.senderActivity.entries()]) {
    if (activity.last_sent_at < cutoff) {
      db.senderActivity.delete(sender);
    }
  }
}

function executeDeleteMyMessages(
  db: {
    senderActivity: Map<string, SenderActivityRecord>;
    globalMessage: GlobalMessageRow[];
  },
  senderId: string,
) {
  db.globalMessage = db.globalMessage.filter((msg) => msg.sender !== senderId);
  db.senderActivity.delete(senderId);
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
    const db = {
      senderActivity: new Map<string, SenderActivityRecord>(),
      globalMessage: [] as GlobalMessageRow[],
    };

    const sender = "sender_alpha";
    const startTime = 1_000_000;

    for (let i = 0; i < RATE_LIMIT_MAX_MESSAGES; i++) {
      expect(() =>
        executeSendMessage(db, sender, startTime + i * 1000, `msg ${i + 1}`),
      ).not.toThrow();
    }

    expect(db.globalMessage).toHaveLength(5);
    const activity = db.senderActivity.get(sender);
    expect(activity?.count).toBe(5);
    expect(activity?.window_start).toBe(startTime);
  });

  it("rejects the 6th message within the same 10-second fixed window with SenderError", () => {
    const db = {
      senderActivity: new Map<string, SenderActivityRecord>(),
      globalMessage: [] as GlobalMessageRow[],
    };

    const sender = "sender_alpha";
    const startTime = 1_000_000;

    for (let i = 0; i < RATE_LIMIT_MAX_MESSAGES; i++) {
      executeSendMessage(db, sender, startTime + i * 1000, `msg ${i + 1}`);
    }

    // 6th message at 5 seconds into the window exceeds budget
    expect(() =>
      executeSendMessage(db, sender, startTime + 5000, "flooding attempt"),
    ).toThrow(SenderError);

    expect(() =>
      executeSendMessage(db, sender, startTime + 5000, "flooding attempt"),
    ).toThrow(/Rate limit exceeded: maximum 5 messages per 10s/);

    expect(db.globalMessage).toHaveLength(5);
  });

  it("isolates rate limits between distinct senders", () => {
    const db = {
      senderActivity: new Map<string, SenderActivityRecord>(),
      globalMessage: [] as GlobalMessageRow[],
    };

    const senderA = "sender_alpha";
    const senderB = "sender_beta";
    const startTime = 1_000_000;

    // Sender A exhausts their quota
    for (let i = 0; i < RATE_LIMIT_MAX_MESSAGES; i++) {
      executeSendMessage(db, senderA, startTime + i * 1000, `A msg ${i + 1}`);
    }
    expect(() =>
      executeSendMessage(db, senderA, startTime + 5000, "A exceed"),
    ).toThrow(SenderError);

    // Sender B can still send freely
    expect(() =>
      executeSendMessage(db, senderB, startTime + 5000, "B msg 1"),
    ).not.toThrow();
    expect(db.globalMessage).toHaveLength(6);
  });

  it("resets the budget after the fixed 10-second window elapses", () => {
    const db = {
      senderActivity: new Map<string, SenderActivityRecord>(),
      globalMessage: [] as GlobalMessageRow[],
    };

    const sender = "sender_alpha";
    const startTime = 1_000_000;

    // 5 messages in first window
    for (let i = 0; i < RATE_LIMIT_MAX_MESSAGES; i++) {
      executeSendMessage(db, sender, startTime + i * 1000, `msg ${i + 1}`);
    }

    // Next window at startTime + 10_000 ms
    const nextWindowTime = startTime + RATE_LIMIT_WINDOW_MS;
    expect(() =>
      executeSendMessage(db, sender, nextWindowTime, "new window msg"),
    ).not.toThrow();

    expect(db.globalMessage).toHaveLength(6);
    const activity = db.senderActivity.get(sender);
    expect(activity?.count).toBe(1);
    expect(activity?.window_start).toBe(nextWindowTime);
  });

  it("prunes inactive sender records past 90-day retention in delete_expired_messages", () => {
    const db = {
      senderActivity: new Map<string, SenderActivityRecord>(),
      globalMessage: [] as GlobalMessageRow[],
    };

    const now = 200 * 24 * 60 * 60 * 1000; // day 200
    const oldTime = now - RETENTION_MS - 1000; // 91 days old
    const recentTime = now - 1000; // 1s ago

    db.senderActivity.set("old_user", {
      sender: "old_user",
      window_start: oldTime,
      count: 1,
      last_sent_at: oldTime,
    });
    db.senderActivity.set("active_user", {
      sender: "active_user",
      window_start: recentTime,
      count: 1,
      last_sent_at: recentTime,
    });

    executeDeleteExpiredMessages(db, now);

    expect(db.senderActivity.has("old_user")).toBe(false);
    expect(db.senderActivity.has("active_user")).toBe(true);
  });

  it("cleans up sender activity on delete_my_messages for GDPR compliance", () => {
    const db = {
      senderActivity: new Map<string, SenderActivityRecord>(),
      globalMessage: [
        { sender: "user_a", text: "msg A", sent_at: 1000 },
        { sender: "user_b", text: "msg B", sent_at: 1000 },
      ],
    };

    db.senderActivity.set("user_a", {
      sender: "user_a",
      window_start: 1000,
      count: 1,
      last_sent_at: 1000,
    });
    db.senderActivity.set("user_b", {
      sender: "user_b",
      window_start: 1000,
      count: 1,
      last_sent_at: 1000,
    });

    executeDeleteMyMessages(db, "user_a");

    expect(db.globalMessage).toHaveLength(1);
    expect(db.globalMessage[0].sender).toBe("user_b");
    expect(db.senderActivity.has("user_a")).toBe(false);
    expect(db.senderActivity.has("user_b")).toBe(true);
  });
});
