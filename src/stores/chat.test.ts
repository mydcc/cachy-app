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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock browser env
vi.mock("$app/environment", () => ({ browser: false }));

vi.mock("./settings.svelte", () => ({
  settingsState: { appAccessToken: "test-token" },
}));
vi.mock("../lib/windows/WindowManager.svelte", () => ({ windowManager: {} }));

// Import the module under test
import { chatState } from "./chat.svelte";

type MutableChat = {
  messages: unknown[];
  latestSeenTimestamp: number;
  lastSentTimestamp: number;
  loading: boolean;
  clientId: string;
  mergeMessages: (current: unknown[], incoming: unknown[]) => unknown[];
};

const internals = chatState as unknown as MutableChat;

describe("ChatManager", () => {
  beforeEach(() => {
    // chatState is a singleton; reset the fields each test depends on.
    internals.messages = [];
    internals.latestSeenTimestamp = 0;
    internals.clientId = "test-client-id";
  });

  describe("no Class A data leaves the device (ADR-0001, roadmap 12a)", () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
      vi.useRealTimers();
    });

    it("sends only the message text and an opaque client ID", async () => {
      // This store used to attach a profit factor computed from the user's
      // journal to every message. The journal is Class A: it must never reach a
      // server, "not even as metadata". This asserts the payload's exact shape,
      // so re-adding any derived field fails here.
      let sentBody: Record<string, unknown> = {};

      globalThis.fetch = vi.fn(async (_url, init) => {
        sentBody = JSON.parse((init as RequestInit).body as string);
        return {
          ok: true,
          json: async () => ({
            message: { id: "1", text: "hello", timestamp: 1 },
          }),
        } as Response;
      }) as unknown as typeof fetch;

      internals.lastSentTimestamp = 0;
      await chatState.sendMessage("hello");

      expect(Object.keys(sentBody).sort()).toEqual(["clientId", "text"]);
      expect(sentBody.text).toBe("hello");
      expect(sentBody.clientId).toBe("test-client-id");
      expect(sentBody).not.toHaveProperty("profitFactor");
    });

    it("sends the app access token, which it previously omitted entirely", async () => {
      // `/api/chat-v2` is guarded by checkAppAuth, which fails closed since
      // ADR-0002. Without this header every poll and send is a 401.
      let sentHeaders: Record<string, string> = {};

      globalThis.fetch = vi.fn(async (_url, init) => {
        sentHeaders = ((init as RequestInit)?.headers ?? {}) as Record<
          string,
          string
        >;
        return { ok: true, json: async () => ({ messages: [] }) } as Response;
      }) as unknown as typeof fetch;

      await (chatState as unknown as { poll: () => Promise<void> }).poll();

      expect(sentHeaders["x-app-access-token"]).toBe("test-token");
    });
  });

  describe("mergeMessages", () => {
    it("keeps every incoming message — nothing is filtered by performance", () => {
      // The profit-factor filter is deliberately gone. Messages that it used to
      // drop must now arrive.
      const merged = internals.mergeMessages(
        [],
        [
          { id: "1", text: "a", timestamp: 100 },
          { id: "2", text: "b", timestamp: 101 },
          { id: "3", text: "c", timestamp: 102 },
        ],
      );

      expect(merged).toHaveLength(3);
    });

    it("advances latestSeenTimestamp to the newest incoming message", () => {
      internals.latestSeenTimestamp = 100;

      internals.mergeMessages([], [{ id: "1", text: "new", timestamp: 200 }]);

      expect(internals.latestSeenTimestamp).toBe(200);
    });

    it("does not move latestSeenTimestamp when nothing arrives", () => {
      internals.latestSeenTimestamp = 50;

      const merged = internals.mergeMessages(
        [{ id: "old", text: "old", timestamp: 50 }],
        [],
      );

      expect(merged).toHaveLength(1);
      expect(internals.latestSeenTimestamp).toBe(50);
    });

    it("drops duplicates by id rather than showing a message twice", () => {
      const merged = internals.mergeMessages(
        [{ id: "1", text: "first", timestamp: 100 }],
        [
          { id: "1", text: "first", timestamp: 100 },
          { id: "2", text: "second", timestamp: 200 },
        ],
      );

      expect(merged).toHaveLength(2);
    });

    it("sorts by timestamp regardless of arrival order", () => {
      const merged = internals.mergeMessages(
        [],
        [
          { id: "late", text: "late", timestamp: 300 },
          { id: "early", text: "early", timestamp: 100 },
        ],
      ) as { id: string }[];

      expect(merged.map((m) => m.id)).toEqual(["early", "late"]);
    });

    it("keeps at most the newest 500 messages", () => {
      const many = Array.from({ length: 600 }, (_, i) => ({
        id: String(i),
        text: "m",
        timestamp: i,
      }));

      const merged = internals.mergeMessages([], many) as { id: string }[];

      expect(merged).toHaveLength(500);
      expect(merged[merged.length - 1].id).toBe("599");
    });
  });

  it("clears history correctly and leaves other state intact", () => {
    internals.messages = [
      { id: "1", text: "Hello", timestamp: 100 },
      { id: "2", text: "World", timestamp: 200 },
    ];
    internals.latestSeenTimestamp = 200;
    internals.lastSentTimestamp = 150;
    internals.loading = true;
    internals.clientId = "existing-client-id";

    chatState.clearHistory();

    expect(internals.messages).toHaveLength(0);

    // Ensure other states remain unaffected
    expect(internals.lastSentTimestamp).toBe(150);
    expect(internals.loading).toBe(true);
    expect(internals.clientId).toBe("existing-client-id");

    // latestSeenTimestamp is intentionally preserved so the next poll
    // only fetches new messages rather than re-fetching cleared history
    expect(internals.latestSeenTimestamp).toBe(200);
  });
});
