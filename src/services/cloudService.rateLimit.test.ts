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
  GLOBAL_RATE_LIMIT_WINDOW_MS,
  GLOBAL_RATE_LIMIT_MAX_MESSAGES,
  CLEANUP_MIN_INTERVAL_MS,
  RETENTION_MS,
  MAX_MESSAGE_LENGTH,
  evaluateRateLimit,
  sanitizeMessageText,
  handleSendMessage,
  handleDeleteExpiredMessages,
  handleDeleteMyMessages,
  type SenderActivityRecord,
  type GlobalMessageRecord,
  type MessageDb,
} from "../../server/spacetimedb/src/rateLimit";
import { sanitizeChatText } from "../lib/utils/chatText";

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

  it("rejects empty and whitespace-only messages (BUG-0726)", () => {
    const memDb = createInMemoryDb();

    expect(() => handleSendMessage(memDb.db, "sender", 1_000_000, "")).toThrow(
      "Message cannot be empty",
    );
    expect(() =>
      handleSendMessage(memDb.db, "sender", 1_000_000, "  \n\t  "),
    ).toThrow("Message cannot be empty");

    expect(memDb.globalMessage).toHaveLength(0);
  });

  it("collapses control characters and line separators to spaces before storing (BUG-0726)", () => {
    const memDb = createInMemoryDb();

    handleSendMessage(
      memDb.db,
      "sender",
      1_000_000,
      "  he\u0000llo\u2028world\u2029  ",
    );

    expect(memDb.globalMessage[0].text).toBe("he llo world");
    expect(sanitizeMessageText("a\tb\nc")).toBe("a b c");
  });

  const INVISIBLE_MESSAGES: Array<[string, string]> = [
    ["zero-width space", "\u200B"],
    ["bidi override", "\u202E"],
    ["braille blank", "\u2800"],
    ["Hangul choseong filler", "\u115F"],
    ["Hangul jungseong filler", "\u1160"],
    ["Arabic letter mark", "\u061C"],
    ["word joiner", "\u2060"],
    ["soft hyphen", "\u00AD"],
    ["Mongolian vowel separator", "\u180E"],
    ["halfwidth Hangul filler", "\uFFA0"],
    ["Hangul filler", "\u3164"],
    ["BOM", "\uFEFF"],
    ["line separator", "\u2028"],
    ["control character", "\u0000"],
    ["Egyptian full blank", "\u{13441}"],
    ["Egyptian half blank", "\u{13442}"],
    ["musical null notehead", "\u{1D159}"],
    ["object replacement", "\uFFFC"],
    ["emoji modifier", "\u{1F3FB}"],
    ["gap filler 1", "\u{11C44}"],
    ["gap filler 2", "\u{11C45}"],
    ["gap filler 3", "\u{1144E}"],
    ["gap filler 4", "\u{11945}"],
    ["placeholder mark 1", "\u{1ECAC}"],
    ["placeholder mark 2", "\uA837"],
    ["tag character", "\u{E0061}"],
    ["musical format control", "\u{1D173}"],
    ["Egyptian format control", "\u{13430}"],
    ["prepended concatenation mark", "\u0600"],
    ["combining grapheme joiner", "\u034F"],
    ["Mongolian free variation selector", "\u180B"],
    ["variation selector", "\uFE0F"],
  ];

  it.each(INVISIBLE_MESSAGES)(
    "rejects a message made only of %s (BUG-0726 review)",
    (_name, text) => {
      const memDb = createInMemoryDb();

      expect(() =>
        handleSendMessage(memDb.db, "sender", 1_000_000, text),
      ).toThrow("Message cannot be empty");
      expect(sanitizeMessageText(text)).toBe("");
      expect(memDb.globalMessage).toHaveLength(0);
    },
  );

  it("keeps visible text while removing formatting marks and spacing blank glyphs", () => {
    expect(sanitizeMessageText("a\u2800b")).toBe("a b");
    expect(sanitizeMessageText("a\u115Fb")).toBe("a b");
    expect(sanitizeMessageText("a\u200Bb")).toBe("a b");
    expect(sanitizeMessageText("a\u00ADb")).toBe("ab");
    expect(sanitizeMessageText("a\u061Cb")).toBe("ab");
    expect(sanitizeMessageText("a\u2060b")).toBe("ab");
    expect(sanitizeMessageText("a\u{E0061}b")).toBe("ab");
    expect(sanitizeMessageText("Silben\u00ADtrennung")).toBe("Silbentrennung");
    // ZWJ is deliberately preserved so emoji clusters survive.
    expect(sanitizeMessageText("👨\u200D👩")).toBe("👨\u200D👩");
    // A modifier after a base emoji survives; a bare modifier does not.
    expect(sanitizeMessageText("👍🏽")).toBe("👍🏽");
    expect(sanitizeMessageText("a\u0301")).toBe("a\u0301");
  });

  it("strips bidi overrides but keeps the visible text around them (BUG-0726 review)", () => {
    expect(sanitizeMessageText("ab\u202Ecd")).toBe("abcd");
  });

  it("keeps the client-side sanitizer in lockstep with the reducer across the BMP", () => {
    const mismatches: string[] = [];

    for (let codePoint = 0; codePoint <= 0xffff; codePoint += 1) {
      const input = String.fromCharCode(codePoint);
      if (sanitizeChatText(input) !== sanitizeMessageText(input)) {
        mismatches.push(`U+${codePoint.toString(16).padStart(4, "0")}`);
      }
    }

    for (const input of [
      "\u{E0001}",
      "\u{E0020}",
      "\u{E007F}",
      "\u{E0100}",
      "👨\u200D👩",
      "👍🏽",
      "a\u2800b",
    ]) {
      if (sanitizeChatText(input) !== sanitizeMessageText(input)) {
        mismatches.push(JSON.stringify(input));
      }
    }

    expect(mismatches).toEqual([]);
  });

  it("rejects an oversized raw payload before the sanitizer runs (BUG-0726 review)", () => {
    const memDb = createInMemoryDb();
    const oversized = "x".repeat(MAX_MESSAGE_LENGTH * 4 + 1);

    expect(() =>
      handleSendMessage(memDb.db, "sender", 1_000_000, oversized),
    ).toThrow("Message too long");
  });

  it("caps messages globally even when the sender rotates identities (BUG-0726)", () => {
    const memDb = createInMemoryDb();
    const start = 1_000_000;
    const sendersPerWindow = Math.ceil(
      GLOBAL_RATE_LIMIT_MAX_MESSAGES / RATE_LIMIT_MAX_MESSAGES,
    );

    for (let s = 0; s < sendersPerWindow; s++) {
      for (let i = 0; i < RATE_LIMIT_MAX_MESSAGES; i++) {
        handleSendMessage(memDb.db, `rotating_${s}`, start + i, `msg ${s}/${i}`);
      }
    }

    expect(memDb.globalMessage).toHaveLength(GLOBAL_RATE_LIMIT_MAX_MESSAGES);

    // A brand-new identity is still inside the per-sender budget, so only the
    // global cap can refuse this one.
    expect(() =>
      handleSendMessage(memDb.db, "fresh_identity", start + 1, "one more"),
    ).toThrow(/too many messages/);
    expect(memDb.globalMessage).toHaveLength(GLOBAL_RATE_LIMIT_MAX_MESSAGES);
    // The global rejection happens before either counter is written.
    expect(memDb.senderActivity.has("fresh_identity")).toBe(false);
  });

  it("a per-sender rejection does not consume the global counter (BUG-0726 review)", () => {
    const memDb = createInMemoryDb();
    const sender = "sender_alpha";
    const start = 1_000_000;

    for (let i = 0; i < RATE_LIMIT_MAX_MESSAGES; i++) {
      handleSendMessage(memDb.db, sender, start + i, `msg ${i}`);
    }
    const globalBefore = memDb.senderActivity.get("__global__")?.count;

    expect(() =>
      handleSendMessage(memDb.db, sender, start + 5_000, "over budget"),
    ).toThrow(/Rate limit exceeded/);

    expect(memDb.senderActivity.get("__global__")?.count).toBe(globalBefore);
  });

  it("erasure leaves the aggregate global counter in place (BUG-0726 review)", () => {
    const memDb = createInMemoryDb();
    handleSendMessage(memDb.db, "user_a", 1_000_000, "hello");

    handleDeleteMyMessages(memDb.db, "user_a");

    expect(memDb.senderActivity.has("__global__")).toBe(true);
  });

  it("opens a new global window after a minute (BUG-0726)", () => {
    const memDb = createInMemoryDb();
    const start = 1_000_000;
    const sendersPerWindow = Math.ceil(
      GLOBAL_RATE_LIMIT_MAX_MESSAGES / RATE_LIMIT_MAX_MESSAGES,
    );

    for (let s = 0; s < sendersPerWindow; s++) {
      for (let i = 0; i < RATE_LIMIT_MAX_MESSAGES; i++) {
        handleSendMessage(memDb.db, `rotating_${s}`, start + i, `msg ${s}/${i}`);
      }
    }

    expect(() =>
      handleSendMessage(
        memDb.db,
        "fresh_identity",
        start + GLOBAL_RATE_LIMIT_WINDOW_MS,
        "next window",
      ),
    ).not.toThrow();
  });

  it("throttles client-invoked cleanup to one scan per interval (BUG-0726 review)", () => {
    const memDb = createInMemoryDb();
    const now = 200 * 24 * 60 * 60 * 1000;

    handleDeleteExpiredMessages(memDb.db, now);
    expect(memDb.senderActivity.has("__cleanup__")).toBe(true);

    // A second call inside the interval must not scan or delete anything.
    memDb.db.globalMessage.insert({
      sender: "user",
      text: "expired but not swept yet",
      sent_at: now - RETENTION_MS - 1,
    });
    const second = handleDeleteExpiredMessages(memDb.db, now + 1_000);
    expect(second.deletedMessages).toBe(0);
    expect(memDb.globalMessage).toHaveLength(1);

    const third = handleDeleteExpiredMessages(
      memDb.db,
      now + CLEANUP_MIN_INTERVAL_MS,
    );
    expect(third.deletedMessages).toBe(1);
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
