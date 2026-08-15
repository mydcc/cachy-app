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

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Decimal } from "decimal.js";

vi.mock("$app/environment", () => ({
  browser: true,
  dev: true,
}));

vi.mock("./marketWatcher", () => ({
  marketWatcher: {
    register: vi.fn(),
    unregister: vi.fn(),
    isBackfilling: vi.fn(() => false),
  },
}));

vi.mock("./technicalsService", () => ({
  technicalsService: {
    cleanupTechnicals: vi.fn(async () => {}),
    initializeTechnicals: vi.fn(async () => ({ oscillators: [], movingAverages: [] })),
    updateTechnicals: vi.fn(async () => ({ oscillators: [], movingAverages: [] })),
  },
}));

vi.mock("../utils/networkMonitor", () => ({
  networkMonitor: {
    getThrottleMultiplier: vi.fn(() => 1.0),
  },
}));

import { activeTechnicalsManager } from "./activeTechnicalsManager.svelte";
import { marketWatcher } from "./marketWatcher";
import { technicalsService } from "./technicalsService";
import { marketState } from "../stores/market.svelte";
import { tradeState } from "../stores/trade.svelte";
import { settingsState } from "../stores/settings.svelte";
import type { KlineBuffers } from "./technicalsTypes";

/**
 * These tests assert on the manager's internal bookkeeping directly — same
 * pattern as bitunixWs.leak.test.ts. Naming the members once beats casting
 * the singleton through `any` at every touch point.
 */
type ManagerInternals = {
  subscribers: Map<string, number>;
  activeEffects: Map<string, () => void>;
  throttles: Map<string, ReturnType<typeof setTimeout> | number>;
  visibleSymbols: Set<string>;
  pausedCalculations: Set<string>;
  workerState: Map<string, { initialized: boolean; lastTime: number; settingsHash?: string }>;
  pool: { acquire: (len: number) => Float64Array; release: (buf: Float64Array) => void };
  isTabVisible: boolean;
  handleVisibilityChange: () => void;
  scheduleCalculation: (symbol: string, timeframe: string) => void;
  prepareBuffersWithRealtime: (original: KlineBuffers, timeframe: string, price: Decimal | null) => KlineBuffers;
};

const internals = activeTechnicalsManager as unknown as ManagerInternals;

function makeBuffers(len: number): KlineBuffers {
  return {
    times: new Float64Array(len),
    opens: new Float64Array(len),
    highs: new Float64Array(len),
    lows: new Float64Array(len),
    closes: new Float64Array(len),
    volumes: new Float64Array(len),
  };
}

function seedKlines(symbol: string, timeframe: string, times: number[]) {
  marketState.updateSymbolKlines(
    symbol,
    timeframe,
    times.map((time) => ({
      time,
      open: new Decimal(100),
      high: new Decimal(110),
      low: new Decimal(90),
      close: new Decimal(105),
      volume: new Decimal(1000),
    })),
  );
}

describe("ActiveTechnicalsManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    internals.subscribers.clear();
    internals.activeEffects.clear();
    internals.throttles.clear();
    internals.visibleSymbols.clear();
    internals.pausedCalculations.clear();
    internals.workerState.clear();
    internals.isTabVisible = true;

    marketState.reset();
    tradeState.symbol = "BTCUSDT";
    settingsState.pauseAnalysisOnBlur = false;
    settingsState.technicalsUpdateInterval = 100;
  });

  afterEach(() => {
    // Belt-and-braces teardown so a failed assertion in one test can't leak
    // a live timer into the next.
    for (const [key, timerId] of internals.throttles.entries()) {
      clearTimeout(timerId as ReturnType<typeof setTimeout>);
      internals.throttles.delete(key);
    }
    for (const cleanup of internals.activeEffects.values()) cleanup();
    internals.activeEffects.clear();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  describe("register/unregister ref-counting", () => {
    it("only starts monitoring on the first register() for a key", () => {
      activeTechnicalsManager.register("BTCUSDT", "1h");
      activeTechnicalsManager.register("BTCUSDT", "1h");
      activeTechnicalsManager.register("BTCUSDT", "1h");

      expect(internals.subscribers.get("BTCUSDT:1h")).toBe(3);
      // startMonitoring registers three channels with marketWatcher exactly
      // once, regardless of how many times register() was called.
      expect(marketWatcher.register).toHaveBeenCalledTimes(3);
      expect(internals.activeEffects.has("BTCUSDT:1h")).toBe(true);
    });

    it("keeps monitoring alive while any subscriber remains", () => {
      activeTechnicalsManager.register("BTCUSDT", "1h");
      activeTechnicalsManager.register("BTCUSDT", "1h");

      activeTechnicalsManager.unregister("BTCUSDT", "1h");

      expect(internals.subscribers.get("BTCUSDT:1h")).toBe(1);
      expect(internals.activeEffects.has("BTCUSDT:1h")).toBe(true);
      expect(marketWatcher.unregister).not.toHaveBeenCalled();
    });

    it("the last unregister() tears down the effect, the throttle and the worker state", () => {
      activeTechnicalsManager.register("BTCUSDT", "1h");
      internals.throttles.set("BTCUSDT:1h", setTimeout(() => {}, 60000));
      internals.workerState.set("BTCUSDT:1h", { initialized: true, lastTime: 1000 });

      const pendingBefore = vi.getTimerCount();
      expect(pendingBefore).toBeGreaterThan(0);

      activeTechnicalsManager.unregister("BTCUSDT", "1h");

      expect(internals.subscribers.has("BTCUSDT:1h")).toBe(false);
      expect(internals.activeEffects.has("BTCUSDT:1h")).toBe(false);
      expect(internals.throttles.has("BTCUSDT:1h")).toBe(false);
      expect(internals.workerState.has("BTCUSDT:1h")).toBe(false);
      // The setTimeout seeded above must have been cleared, not just
      // forgotten about in the Map.
      expect(vi.getTimerCount()).toBe(0);

      expect(marketWatcher.unregister).toHaveBeenCalledTimes(3);
      expect(technicalsService.cleanupTechnicals).toHaveBeenCalledWith("BTCUSDT", "1h");
    });

    it("unregister() on an unknown key is a safe no-op", () => {
      expect(() => activeTechnicalsManager.unregister("NOSUCH", "1h")).not.toThrow();
      expect(marketWatcher.unregister).not.toHaveBeenCalled();
    });
  });

  describe("tab-visibility pause/resume", () => {
    it("pauses non-active symbols when the tab is hidden but keeps the active symbol running", () => {
      tradeState.symbol = "BTCUSDT";
      internals.throttles.set("BTCUSDT:1h", setTimeout(() => {}, 60000));
      internals.throttles.set("ETHUSDT:1h", setTimeout(() => {}, 60000));

      internals.isTabVisible = true;
      Object.defineProperty(document, "hidden", { value: true, configurable: true });
      internals.handleVisibilityChange();

      // Active symbol's throttle survives untouched.
      expect(internals.throttles.has("BTCUSDT:1h")).toBe(true);
      // Non-active symbol's throttle is cancelled and parked as paused.
      expect(internals.throttles.has("ETHUSDT:1h")).toBe(false);
      expect(internals.pausedCalculations.has("ETHUSDT:1h")).toBe(true);
      expect(internals.pausedCalculations.has("BTCUSDT:1h")).toBe(false);

      Object.defineProperty(document, "hidden", { value: false, configurable: true });
    });

    it("resumes paused calculations, staggered, when the tab becomes visible again", () => {
      internals.pausedCalculations.add("ETHUSDT:1h");
      internals.isTabVisible = false;
      Object.defineProperty(document, "hidden", { value: false, configurable: true });

      internals.handleVisibilityChange();

      expect(internals.pausedCalculations.size).toBe(0);
      // resumeCalculations() reschedules via a staggered setTimeout rather
      // than scheduling synchronously.
      expect(vi.getTimerCount()).toBeGreaterThan(0);
    });
  });

  describe("throttle scheduling", () => {
    it("coalesces a burst of scheduleCalculation() calls for the same key into a single timer", () => {
      internals.scheduleCalculation("BTCUSDT", "1h");
      internals.scheduleCalculation("BTCUSDT", "1h");
      internals.scheduleCalculation("BTCUSDT", "1h");
      internals.scheduleCalculation("BTCUSDT", "1h");

      expect(internals.throttles.size).toBe(1);
    });

    it("runs performCalculation exactly once after the throttle delay for a coalesced burst", async () => {
      seedKlines("BTCUSDT", "1h", [1000]);
      tradeState.symbol = "BTCUSDT";

      internals.scheduleCalculation("BTCUSDT", "1h");
      internals.scheduleCalculation("BTCUSDT", "1h");
      internals.scheduleCalculation("BTCUSDT", "1h");

      await vi.advanceTimersByTimeAsync(200);

      expect(technicalsService.initializeTechnicals).toHaveBeenCalledTimes(1);
      expect(internals.throttles.has("BTCUSDT:1h")).toBe(false);
    });
  });

  describe("buffer pairing in prepareBuffersWithRealtime", () => {
    // prepareBuffersWithRealtime has no callers anywhere in this class (or
    // outside it — it's private). It is characterised here in isolation so
    // FEAT-0196's split preserves its current behaviour exactly, whether or
    // not that behaviour is exercised in production today.
    it("acquires fresh buffers from the pool for an append", () => {
      const original = makeBuffers(3);
      original.times.set([1000, 2000, 3000]);
      const acquireSpy = vi.spyOn(internals.pool, "acquire");

      const priceTime = Math.floor(Date.now() / 3600000) * 3600000;
      vi.setSystemTime(priceTime + 3600000); // one interval past the last candle

      const result = internals.prepareBuffersWithRealtime(original, "1h", new Decimal(105));

      expect(acquireSpy).toHaveBeenCalledTimes(6); // times/opens/highs/lows/closes/volumes
      expect(result.times.length).toBe(4);
      expect(result.times[3]).toBe(priceTime + 3600000);
      expect(result.closes[3]).toBe(105);
    });

    it("does not release the buffers it replaces back to the pool", () => {
      // Documents current behaviour: acquire has no matching release in this
      // method (or anywhere it might otherwise be called from), so the
      // original buffers are simply discarded rather than pooled. This is
      // the pairing this test exists to pin -- there isn't one today.
      const original = makeBuffers(2);
      const releaseSpy = vi.spyOn(internals.pool, "release");

      internals.prepareBuffersWithRealtime(original, "1h", null);

      expect(releaseSpy).not.toHaveBeenCalled();
    });

    it("copies values through unchanged when there is no price to apply", () => {
      // Still allocates fresh (pooled) buffers and copies the source data
      // across verbatim -- there is no "no-op, return the input" fast path
      // for a null price.
      const original = makeBuffers(2);
      original.closes.set([50, 51]);

      const result = internals.prepareBuffersWithRealtime(original, "1h", null);

      expect(result).not.toBe(original);
      expect(Array.from(result.closes)).toEqual([50, 51]);
      expect(result.times.length).toBe(original.times.length);
    });
  });

  describe("effect lifecycle", () => {
    it("the $effect registered by startMonitoring schedules a calculation when market data changes, and stops firing after the matching unregister", async () => {
      seedKlines("BTCUSDT", "1h", [1000]);
      tradeState.symbol = "BTCUSDT";

      activeTechnicalsManager.register("BTCUSDT", "1h");
      // Svelte flushes $effect asynchronously; flushSync() does not run
      // effects inside a detached $effect.root (see preset.test.ts), so the
      // async timer-advance is what actually lets the effect run.
      await vi.advanceTimersByTimeAsync(0);

      expect(internals.throttles.has("BTCUSDT:1h")).toBe(true);

      activeTechnicalsManager.unregister("BTCUSDT", "1h");
      internals.throttles.clear(); // isolate: only interested in the effect firing again below

      // A further market-data change after unregister must not re-schedule
      // anything -- the effect's cleanup should have detached it.
      marketState.updateTicker("BTCUSDT", { lastPrice: "999" });
      await vi.advanceTimersByTimeAsync(0);

      expect(internals.throttles.has("BTCUSDT:1h")).toBe(false);
    });
  });
});
