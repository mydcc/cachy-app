/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock browser env — false, so the constructor does not open a connection.
vi.mock("$app/environment", () => ({ browser: false }));

vi.mock("./settings.svelte", () => ({
  settingsState: {
    cloudEnabled: false,
    cloudHost: "http://127.0.0.1:3000",
    cloudDbName: "cachy-server",
    cloudToken: "",
  },
}));

const { mockCloud } = vi.hoisted(() => ({
  mockCloud: {
    sendMessage: vi.fn(),
    subscribeMessages: vi.fn(),
    subscribeStatus: vi.fn(),
    connect: vi.fn(),
    isConnected: vi.fn(() => false),
    status: vi.fn(() => ({
      connected: false,
      lastError: null,
      mySenderId: null,
    })),
  },
}));

vi.mock("../services/cloudService", () => ({ cloudService: mockCloud }));

import { chatState } from "./chat.svelte";

type Internals = {
  applyRows: (rows: { sender: string; text: string; sentAt: number }[]) => void;
  applyStatus: (s: {
    connected: boolean;
    lastError: string | null;
    mySenderId: string | null;
  }) => void;
};

const internals = chatState as unknown as Internals;

/**
 * Global Chat runs on SpacetimeDB (roadmap item 12). The file-based
 * `/api/chat-v2` backend it used to poll is gone; the window and the panel it
 * feeds are unchanged, which is why this store still presents the same shape.
 */
describe("ChatManager (SpacetimeDB-backed)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatState.messages = [];
    chatState.clientId = "";
    chatState.connected = false;
    chatState.lastSentTimestamp = 0;
  });

  describe("mapping module rows to what the UI reads", () => {
    it("keeps the fields the panel and the window consume", () => {
      internals.applyStatus({
        connected: true,
        lastError: null,
        mySenderId: "aabbccdd",
      });
      internals.applyRows([
        { sender: "aabbccdd", text: "mine", sentAt: 1000 },
        { sender: "11223344", text: "theirs", sentAt: 2000 },
      ]);

      const [mine, theirs] = chatState.messages;

      expect(mine.text).toBe("mine");
      expect(mine.timestamp).toBe(1000);
      expect(mine.senderId).toBe("me");
      expect(mine.clientId).toBe("aabbccdd");
      expect(theirs.senderId).toBe("11223344");
      expect(theirs.clientId).toBe("11223344");
    });

    it("gives every message a stable key, since the module table has no id", () => {
      internals.applyRows([
        { sender: "aabbccdd", text: "one", sentAt: 1000 },
        { sender: "aabbccdd", text: "two", sentAt: 1001 },
      ]);

      const ids = chatState.messages.map((m) => m.id);

      expect(ids).toEqual(["aabbccdd:1000", "aabbccdd:1001"]);
      expect(new Set(ids).size).toBe(2);
    });

    it("sorts by timestamp regardless of the order rows arrive in", () => {
      internals.applyRows([
        { sender: "a", text: "late", sentAt: 3000 },
        { sender: "b", text: "early", sentAt: 1000 },
      ]);

      expect(chatState.messages.map((m) => m.text)).toEqual(["early", "late"]);
    });

    it("re-marks ownership once the identity is known", () => {
      // Rows can arrive before onConnect reports the identity, so every message
      // would otherwise be stuck rendering as someone else's.
      internals.applyRows([
        { sender: "aabbccdd", text: "mine", sentAt: 1000 },
      ]);
      expect(chatState.messages[0].senderId).toBe("aabbccdd");

      internals.applyStatus({
        connected: true,
        lastError: null,
        mySenderId: "aabbccdd",
      });

      expect(chatState.messages[0].senderId).toBe("me");
    });
  });

  describe("sendMessage", () => {
    beforeEach(() => {
      internals.applyStatus({
        connected: true,
        lastError: null,
        mySenderId: "aabbccdd",
      });
    });

    it("sends the text and nothing else", () => {
      // No profit factor, no journal statistic, no settings — ADR-0001 Class B
      // condition 3. The module's schema has room for nothing else either.
      chatState.sendMessage("hello");

      expect(mockCloud.sendMessage).toHaveBeenCalledWith("hello");
      expect(mockCloud.sendMessage).toHaveBeenCalledTimes(1);
    });

    it("enforces the 2-second rate limit", async () => {
      await chatState.sendMessage("first");

      await expect(chatState.sendMessage("second")).rejects.toThrow(
        /2 seconds/,
      );
      expect(mockCloud.sendMessage).toHaveBeenCalledTimes(1);
    });

    it("rejects a message longer than the module accepts", async () => {
      // The module throws above 1000 characters; catching it here avoids a
      // round trip that can only fail.
      await expect(
        chatState.sendMessage("x".repeat(1001)),
      ).rejects.toThrow(/too long/);
      expect(mockCloud.sendMessage).not.toHaveBeenCalled();
    });

    it("refuses to send while disconnected, with an actionable message", async () => {
      internals.applyStatus({
        connected: false,
        lastError: null,
        mySenderId: null,
      });

      await expect(chatState.sendMessage("hello")).rejects.toThrow(
        /Settings → Cloud/,
      );
      expect(mockCloud.sendMessage).not.toHaveBeenCalled();
    });
  });

  it("clearHistory clears the local view only", () => {
    internals.applyRows([{ sender: "a", text: "hi", sentAt: 1 }]);
    chatState.lastSentTimestamp = 150;

    chatState.clearHistory();

    expect(chatState.messages).toHaveLength(0);
    // Server-side history is governed by the retention policy, not by this.
    expect(chatState.lastSentTimestamp).toBe(150);
  });
});
