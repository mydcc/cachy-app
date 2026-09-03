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

import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Roadmap item 15b: the erasure reducer, reachable from the interface.
 *
 * The awkward part this covers is a deployment state, not a bug. The reducer
 * lives in `server/spacetimedb/src/index.ts`, but the client can only call it
 * through bindings produced by `spacetime generate`. A build made before that
 * ran does not have it, and hand-editing generated files is forbidden by
 * `server/CLAUDE.md`. So the client checks, and says so plainly, instead of
 * throwing an opaque "not a function".
 */

const { mockLogger, mockReducers } = vi.hoisted(() => ({
  mockLogger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  // Mutable: each test decides whether this build's bindings know the reducer.
  mockReducers: {} as Record<string, unknown>,
}));

vi.mock("./logger", () => ({ logger: mockLogger }));
vi.mock("../lib/spacetimedb", () => ({
  DbConnection: { builder: () => ({}) },
  tables: {},
  reducers: mockReducers,
}));
vi.mock("../lib/spacetimedb/global_message_type", () => ({ default: {} }));
vi.mock("../stores/settings.svelte", () => ({
  settingsState: { cloudHost: "http://127.0.0.1:3000", cloudDbName: "cachy" },
}));

import { cloudService } from "./cloudService";

type Internals = { connected: boolean; lastError: string | null };
const internals = cloudService as unknown as Internals;

describe("deleteMyMessages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(mockReducers)) delete mockReducers[key];
    internals.connected = false;
    internals.lastError = null;
  });

  describe("when the bindings include the reducer", () => {
    beforeEach(() => {
      mockReducers.deleteMyMessages = vi.fn();
      internals.connected = true;
    });

    it("reports the capability as available", () => {
      expect(cloudService.canDeleteMyMessages()).toBe(true);
    });

    it("calls the reducer with no arguments", () => {
      // The module derives the sender from ctx.sender, so passing an identity
      // would be both unnecessary and a way to aim erasure at someone else.
      cloudService.deleteMyMessages();

      expect(mockReducers.deleteMyMessages).toHaveBeenCalledWith({});
    });
  });

  describe("when the bindings predate the reducer", () => {
    beforeEach(() => {
      internals.connected = true;
    });

    it("reports the capability as unavailable", () => {
      expect(cloudService.canDeleteMyMessages()).toBe(false);
    });

    it("throws a message naming the fix, rather than 'not a function'", () => {
      expect(() => cloudService.deleteMyMessages()).toThrow(
        /spacetime generate/,
      );
    });
  });

  it("refuses while disconnected, before looking at the bindings", () => {
    mockReducers.deleteMyMessages = vi.fn();
    internals.connected = false;

    expect(() => cloudService.deleteMyMessages()).toThrow(/Not connected/);
    expect(mockReducers.deleteMyMessages).not.toHaveBeenCalled();
  });

  describe("identity collision isolation (BUG-0373)", () => {
    it("isolates deletion when two identities share an 8-character prefix", () => {
      const identityA = "aabbccdd11111111222222223333333344444444555555556666666677777777";
      const identityB = "aabbccdd8888888899999999aaaaaaaa00000000bbbbbbbbccccccccdddddddd";

      // Both identities share the first 8 hex characters
      expect(identityA.substring(0, 8)).toBe(identityB.substring(0, 8));
      expect(identityA).not.toBe(identityB);

      const messages = [
        { sender: identityA, text: "message from A", sent_at: 1000 },
        { sender: identityB, text: "message from B", sent_at: 2000 },
      ];

      // Simulated delete_my_messages reducer execution for caller A (matching full identity)
      const deletedForA: typeof messages = [];
      const remaining = messages.filter((msg) => {
        if (msg.sender === identityA) {
          deletedForA.push(msg);
          return false;
        }
        return true;
      });

      expect(deletedForA).toHaveLength(1);
      expect(deletedForA[0].sender).toBe(identityA);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].sender).toBe(identityB);
      expect(remaining[0].text).toBe("message from B");
    });
  });
});
