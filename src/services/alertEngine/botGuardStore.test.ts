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

/*
 * FEAT-0822 — the guard log, durable and bounded.
 *
 * Every suppressed or refused action lands here with its reason and, when
 * one exists, the candle it was suppressed on. The same reason repeating
 * updates the newest record's count instead of appending — "appears once in
 * the guard log" is the acceptance criterion, and a per-candle flood is the
 * failure it exists to stop. Bounded per rule, because localStorage is.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/env", () => ({ browser: true }));

import {
  BOT_GUARD_MAX_PER_RULE,
  BOT_GUARD_STORAGE_KEY,
  clearBotGuards,
  readBotGuards,
  recordBotGuard,
} from "./botGuardStore";

beforeEach(() => {
  localStorage.clear();
});

describe("FEAT-0822 — the guard log", () => {
  it("records a suppressed or refused action with its reason and anchor", () => {
    recordBotGuard("bot-1", "slot-reserved", 5_000);

    const rows = readBotGuards("bot-1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      reason: "slot-reserved",
      count: 1,
      anchorMs: 5_000,
    });
    expect(rows[0].lastAtMs).toBeGreaterThanOrEqual(rows[0].firstAtMs);
  });

  it("counts a repeating reason on its newest row instead of appending", () => {
    recordBotGuard("bot-1", "limit-entries-day", 1);
    recordBotGuard("bot-1", "limit-entries-day", 2);
    recordBotGuard("bot-1", "limit-entries-day", 3);

    const rows = readBotGuards("bot-1");
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(3);
    expect(rows[0].anchorMs).toBe(3);
  });

  it("keeps distinct reasons and distinct rules apart, newest first", () => {
    recordBotGuard("bot-1", "limit-entries-day", 1);
    recordBotGuard("bot-1", "slot-reserved", 2);
    recordBotGuard("bot-2", "policy-once", 3);

    expect(readBotGuards("bot-1").map((r) => r.reason)).toEqual([
      "slot-reserved",
      "limit-entries-day",
    ]);
    expect(readBotGuards("bot-2").map((r) => r.reason)).toEqual(["policy-once"]);
  });

  it("binds a rule's history, dropping the oldest past the cap", () => {
    for (let i = 0; i < BOT_GUARD_MAX_PER_RULE + 5; i++) {
      recordBotGuard("bot-1", `reason-${i}`, i);
    }

    const rows = readBotGuards("bot-1");
    expect(rows).toHaveLength(BOT_GUARD_MAX_PER_RULE);
    expect(rows[0].reason).toBe(`reason-${BOT_GUARD_MAX_PER_RULE + 4}`);
    expect(rows[rows.length - 1].reason).toBe("reason-5");
  });

  it("recounts a reason that repeats after another reason intervened", () => {
    recordBotGuard("bot-1", "limit-entries-day", 1);
    recordBotGuard("bot-1", "slot-reserved", 2);
    // The day limit binds again on a later candle: a fresh row, because
    // the chronology matters more than a minimal row count.
    recordBotGuard("bot-1", "limit-entries-day", 3);

    const rows = readBotGuards("bot-1");
    expect(rows.map((r) => r.reason)).toEqual([
      "limit-entries-day",
      "slot-reserved",
      "limit-entries-day",
    ]);
    expect(rows[0].count).toBe(1);
  });

  it("survives a reload", () => {
    recordBotGuard("bot-1", "slot-reserved", 5);

    // A fresh read goes through storage; nothing is held in memory beyond
    // the write itself.
    expect(readBotGuards("bot-1")[0].reason).toBe("slot-reserved");
    expect(JSON.parse(localStorage.getItem(BOT_GUARD_STORAGE_KEY) ?? "{}")).toMatchObject({
      schema_version: 1,
    });
  });

  it("never throws, and reads an unreadable ledger as empty", () => {
    localStorage.setItem(BOT_GUARD_STORAGE_KEY, "{not json");
    expect(readBotGuards("bot-1")).toEqual([]);
    expect(() => recordBotGuard("bot-1", "slot-reserved", 1)).not.toThrow();
    // The corrupt blob was diagnostic history, not money-path state, so the
    // next write re-seeds the ledger instead of refusing forever.
    expect(JSON.parse(localStorage.getItem(BOT_GUARD_STORAGE_KEY) ?? "{}").per_rule["bot-1"]).toBeDefined();
  });

  it("drops a corrupt record without dropping its neighbours", () => {
    localStorage.setItem(
      BOT_GUARD_STORAGE_KEY,
      JSON.stringify({
        schema_version: 1,
        per_rule: {
          "bot-1": [
            { reason: "slot-reserved", count: 1, firstAtMs: 1, lastAtMs: 1 },
            "not a record",
            { reason: "limit-entries-day", count: 1, firstAtMs: 2, lastAtMs: 2 },
          ],
        },
      }),
    );

    // Storage is oldest-first; the reader answers newest-first.
    const rows = readBotGuards("bot-1");
    expect(rows.map((r) => r.reason)).toEqual(["limit-entries-day", "slot-reserved"]);
  });

  it("clearing a rule's history drops it alone, leaving other rules untouched", () => {
    recordBotGuard("bot-1", "slot-reserved", 1);
    recordBotGuard("bot-2", "limit-entries-day", 1);

    clearBotGuards("bot-1");

    expect(readBotGuards("bot-1")).toEqual([]);
    expect(readBotGuards("bot-2")).toHaveLength(1);

    // An absent rule clears to the same silence — never a throw.
    expect(() => clearBotGuards("nobody")).not.toThrow();
  });
});
