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
  anchorMs: number,
  symbol = "BTCUSDT",
): ShadowFiringRecord {
  return {
    source: "shadow",
    recordedAtMs: anchorMs + 60_000,
    symbol,
    id,
    timeframe: "1m",
    anchorMs,
    verdict: "fires",
  };
}

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

    it("measures the close-versus-tick delay against the candle anchor", () => {
      // Legacy fired mid-candle at 30s; the candle it belongs to closed at 60s.
      recordFiring(legacy("a1", 30_000));
      recordFiring(shadow("a1", 60_000));

      expect(compareShadowLedger().delaysMs).toEqual([30_000]);
    });

    it("surfaces a legacy firing the shadow path never saw", () => {
      // The touch-and-recover case: a spike crossed and closed back below.
      recordFiring(legacy("a1", 30_000));

      const comparison = compareShadowLedger();

      expect(comparison.legacyOnly.map((r) => r.id)).toEqual(["a1"]);
      expect(comparison.delaysMs).toEqual([]);
    });

    it("surfaces a shadow firing with no legacy counterpart", () => {
      recordFiring(shadow("a1", 60_000));

      expect(compareShadowLedger().shadowOnly.map((r) => r.id)).toEqual(["a1"]);
    });

    it("does not pair records across symbols", () => {
      recordFiring(legacy("a1", 30_000, "BTCUSDT"));
      recordFiring(shadow("a1", 60_000, "ETHUSDT"));

      const comparison = compareShadowLedger();

      expect(comparison.legacyOnly).toHaveLength(1);
      expect(comparison.shadowOnly).toHaveLength(1);
      expect(comparison.delaysMs).toEqual([]);
    });
  });
});
