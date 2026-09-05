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

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearShadowLedger,
  compareShadowLedger,
  readShadowLedger,
  recordFiring,
  SHADOW_LEDGER_MAX_RECORDS,
  SHADOW_LEDGER_STORAGE_KEY,
  type ShadowFiringRecord,
} from "./shadowLedger";

vi.mock("$app/environment", () => ({ browser: true, dev: false }));

vi.mock("../logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function legacy(id: string, recordedAtMs: number, symbol = "BTCUSDT"): ShadowFiringRecord {
  return { source: "legacy", recordedAtMs, symbol, id, price: "100" };
}

function shadow(
  id: string,
  recordedAtMs: number,
  symbol = "BTCUSDT",
  anchorMs = CANDLE_OPEN_MS,
): ShadowFiringRecord {
  return {
    source: "shadow",
    recordedAtMs,
    symbol,
    id,
    timeframe: "1m",
    anchorMs,
    verdict: "fires",
  };
}

/**
 * Epoch-scale timestamps on purpose. An earlier version of `delaysMs`
 * subtracted a wall-clock `recordedAtMs` from the candle's `anchorMs`, which
 * looks plausible with small synthetic numbers and produces the candle's age —
 * or a large negative — with real ones. These constants are what makes that
 * class of mistake fail the test rather than pass it.
 */
const CANDLE_OPEN_MS = 1_757_030_400_000;
const CANDLE_CLOSE_MS = CANDLE_OPEN_MS + 60_000;

describe("shadowLedger", () => {
  beforeEach(() => {
    localStorage.clear();
    // restore, not clear: one test replaces `setItem` with a throwing stub,
    // and clearAllMocks would leave that implementation in place for every
    // test after it.
    vi.restoreAllMocks();
  });

  describe("recording", () => {
    it("appends records in order", () => {
      recordFiring(legacy("a1", 1_000));
      recordFiring(shadow("a1", 1_000));

      const { records } = readShadowLedger();

      expect(records.map((r) => r.source)).toEqual(["legacy", "shadow"]);
    });

    it("drops the oldest once the cap is reached", () => {
      for (let i = 0; i < SHADOW_LEDGER_MAX_RECORDS + 10; i++) {
        recordFiring(legacy(`a${i}`, i));
      }

      const { records } = readShadowLedger();

      expect(records).toHaveLength(SHADOW_LEDGER_MAX_RECORDS);
      // The first ten are gone, the newest survived.
      expect(records[0].id).toBe("a10");
      expect(records[records.length - 1].id).toBe(`a${SHADOW_LEDGER_MAX_RECORDS + 9}`);
    });

    it("reports a failed write instead of throwing", () => {
      // The failure is provoked through the record rather than by replacing
      // localStorage: the test environment hands out a Proxy that refuses
      // both a spy and an assignment on `setItem`. A record that cannot be
      // serialised takes the same catch as a quota error, which is the branch
      // under test — recording must report, never throw.
      const circular = { ...legacy("a1", 1_000) } as Record<string, unknown>;
      circular.self = circular;

      expect(recordFiring(circular as unknown as ShadowFiringRecord)).toBe(false);
      expect(readShadowLedger().records).toEqual([]);
    });
  });

  describe("reading", () => {
    it("returns an empty ledger when nothing was written", () => {
      expect(readShadowLedger().records).toEqual([]);
    });

    it("keeps the good records when one is corrupt", () => {
      localStorage.setItem(
        SHADOW_LEDGER_STORAGE_KEY,
        JSON.stringify({
          schema_version: 1,
          records: [legacy("a1", 1_000), { source: "nonsense" }, shadow("a1", 1_000)],
        }),
      );

      expect(readShadowLedger().records).toHaveLength(2);
    });

    it("starts fresh on an unusable file", () => {
      localStorage.setItem(SHADOW_LEDGER_STORAGE_KEY, "not json");

      expect(readShadowLedger().records).toEqual([]);
    });

    it("clears on request", () => {
      recordFiring(legacy("a1", 1_000));
      clearShadowLedger();

      expect(readShadowLedger().records).toEqual([]);
    });
  });

  describe("comparison", () => {
    it("counts both sequences", () => {
      recordFiring(legacy("a1", 1_000));
      recordFiring(shadow("a1", 1_000));
      recordFiring(legacy("a2", 2_000));

      const comparison = compareShadowLedger();

      expect(comparison.legacyCount).toBe(2);
      expect(comparison.shadowCount).toBe(1);
    });

    it("measures the delay between the two wall-clock firing times", () => {
      // Legacy fired mid-candle, 30s after it opened; the rule path fired 50ms
      // after that candle closed.
      recordFiring(legacy("a1", CANDLE_OPEN_MS + 30_000));
      recordFiring(shadow("a1", CANDLE_CLOSE_MS + 50));

      expect(compareShadowLedger().delaysMs).toEqual([30_050]);
    });

    it("never reports a delay on the scale of an epoch timestamp", () => {
      recordFiring(legacy("a1", CANDLE_OPEN_MS + 30_000));
      recordFiring(shadow("a1", CANDLE_CLOSE_MS + 50));

      // A candle's open time subtracted from a wall clock is ~1.7e12, not a
      // delay. Anything past an hour here means the two sides are being
      // compared on different footings again.
      const [delay] = compareShadowLedger().delaysMs;
      expect(delay).toBeGreaterThan(0);
      expect(delay).toBeLessThan(3_600_000);
    });

    it("surfaces a legacy firing the rule path never saw", () => {
      // The touch-and-recover case: a spike crossed and closed back below.
      recordFiring(legacy("a1", CANDLE_OPEN_MS + 30_000));

      const comparison = compareShadowLedger();

      expect(comparison.legacyOnly.map((r) => r.id)).toEqual(["a1"]);
      expect(comparison.delaysMs).toEqual([]);
    });

    it("surfaces a shadow firing with no legacy counterpart", () => {
      recordFiring(shadow("a1", CANDLE_CLOSE_MS));

      expect(compareShadowLedger().shadowOnly.map((r) => r.id)).toEqual(["a1"]);
    });

    it("does not pair records across symbols", () => {
      recordFiring(legacy("a1", CANDLE_OPEN_MS + 30_000, "BTCUSDT"));
      recordFiring(shadow("a1", CANDLE_CLOSE_MS, "ETHUSDT"));

      const comparison = compareShadowLedger();

      expect(comparison.legacyOnly).toHaveLength(1);
      expect(comparison.shadowOnly).toHaveLength(1);
      expect(comparison.delaysMs).toEqual([]);
    });
  });
});
