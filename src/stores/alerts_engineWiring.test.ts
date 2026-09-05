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

/**
 * BUG-0382 regression: the alert engine is never initialised, so no alert ever
 * fires.
 *
 * `ensureLoaded()` was the only thing that assigns the engine's WASM instance
 * and had no call site anywhere in `src/`; `alertState.syncEngine()` was the
 * only thing that pushes localStorage-rehydrated definitions into the engine
 * and likewise had none. Every public method on the service early-returns on a
 * null instance, silently, so the shipped build evaluated nothing.
 *
 * These tests exercise the real service against a fake WASM module supplied at
 * the loader seam. Mocking `alertEngine` itself would only assert that a mock
 * was called and would still pass with the bug present.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// The store's init is client-only (the WASM glue does not exist during SSR).
// The `unit` project pins `browser` to false, so the startup path has to be
// declared explicitly or it would no-op and every test would pass vacuously.
//
// Set per test in `beforeEach` rather than once at module scope: the SSR test
// needs `browser: false`, and undoing a module-scope `vi.mock` with
// `vi.doUnmock` drops back to the real alias (where `browser` is false) for
// every test that follows, which silently makes them vacuous again.
const mockEnvironment = (isBrowser: boolean) =>
  vi.doMock("$app/environment", () => ({
    browser: isBrowser,
    dev: false,
    building: false,
    version: "0.0.1",
  }));

vi.mock("../services/logger", () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("../services/toastService.svelte", () => ({
  toastService: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Returns the key itself, so assertions can name the string that reached the
// user rather than depending on the German or English wording.
vi.mock("../locales/i18n", () => ({
  _: {
    subscribe: (run: (v: unknown) => void) => {
      run((key: string) => key);
      return () => {};
    },
  },
}));

const STORAGE_KEY = "cachy_alerts_v1";

/** An alert armed in a previous session and rehydrated from localStorage. */
const ARMED_BEFORE_RELOAD = {
  id: "alert-armed-before-reload",
  symbol: "BTCUSDT",
  // Decimal string, not a number: the Rust side deserializes the threshold
  // with rust_decimal's `serde-with-str` and rejects a bare JSON number.
  condition: { price_reached: "50000.0" },
  active: true,
};

/**
 * Stand-in for the compiled `AlertEngineWasm`, faithful to the real core's
 * contract on the two points these tests depend on: it only considers alerts
 * whose `active` is true (`alert_engine.rs:86`), and it needs a previous price
 * before it can detect a crossing.
 */
class FakeAlertEngineWasm {
  alerts: Array<typeof ARMED_BEFORE_RELOAD> = [];
  private lastPrices = new Map<string, number>();

  set_alerts(alertsJson: string) {
    this.alerts = JSON.parse(alertsJson);
  }

  add_alert(alertJson: string) {
    const alert = JSON.parse(alertJson);
    this.alerts = [...this.alerts.filter((a) => a.id !== alert.id), alert];
  }

  remove_alert(id: string) {
    this.alerts = this.alerts.filter((a) => a.id !== id);
  }

  evaluate(symbol: string, currentPriceStr: string, timestamp: number) {
    const current = Number(currentPriceStr);
    const last = this.lastPrices.get(symbol);
    this.lastPrices.set(symbol, current);

    const events = [];
    for (const alert of this.alerts) {
      if (!alert.active || alert.symbol !== symbol) continue;
      if (last === undefined) continue;
      const target = Number(alert.condition.price_reached);
      if ((last < target && current >= target) || (last > target && current <= target)) {
        alert.active = false; // hysteresis: fires once
        events.push({
          alert_id: alert.id,
          symbol,
          timestamp,
          price: currentPriceStr,
        });
      }
    }
    return events;
  }

  free() {}
}

let fakeInstance: FakeAlertEngineWasm;

const fakeLoader = async () =>
  ({
    default: async () => {},
    AlertEngineWasm: class {
      constructor() {
        fakeInstance = new FakeAlertEngineWasm();
        return fakeInstance;
      }
    },
  }) as never;

describe("BUG-0382 — alert engine startup wiring", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockEnvironment(true);
    localStorage.clear();
    localStorage.setItem(STORAGE_KEY, JSON.stringify([ARMED_BEFORE_RELOAD]));
    // The fake engine mutates its own alert objects when they fire; hand each
    // test a fresh copy so one test's fired alert cannot arrive still-fired.
    ARMED_BEFORE_RELOAD.active = true;
  });

  it("leaves the engine unloaded until something initialises it", async () => {
    const { alertEngine } = await import("../services/alertEngine/alertEngine");

    // The state the bug shipped in — kept as an explicit baseline so the
    // assertions below are known to be measuring the transition.
    expect(alertEngine.isLoaded).toBe(false);
  });

  it("loads the engine at startup so evaluation is no longer a silent no-op", async () => {
    const { alertEngine } = await import("../services/alertEngine/alertEngine");
    const { initAlertEngine } = await import("./alerts.svelte");

    await initAlertEngine(fakeLoader);

    // Fails without the fix: nothing ever called ensureLoaded(), so the
    // instance stayed null and evaluate() early-returned on every tick.
    expect(alertEngine.isLoaded).toBe(true);
  });

  it("re-registers alerts rehydrated from localStorage", async () => {
    const { initAlertEngine } = await import("./alerts.svelte");

    await initAlertEngine(fakeLoader);

    // Fails without the fix: syncEngine() had no call site, so an alert armed
    // before a reload never reached the engine.
    expect(fakeInstance.alerts.map((a) => a.id)).toEqual([ARMED_BEFORE_RELOAD.id]);
  });

  it("fires an alert armed before reload, and the event reaches the store", async () => {
    const { alertEngine } = await import("../services/alertEngine/alertEngine");
    const { alertState, initAlertEngine } = await import("./alerts.svelte");

    await initAlertEngine(fakeLoader);

    // Seed the previous price, then cross the 50000.0 level upwards.
    alertEngine.evaluate("BTCUSDT", "49900.0", 1);
    alertEngine.evaluate("BTCUSDT", "50100.0", 2);

    const fired = alertState.definitions.find((a) => a.id === ARMED_BEFORE_RELOAD.id);
    expect(fired?.active).toBe(false);
  });

  it("does not fire an alert whose level was never crossed", async () => {
    const { alertEngine } = await import("../services/alertEngine/alertEngine");
    const { alertState, initAlertEngine } = await import("./alerts.svelte");

    await initAlertEngine(fakeLoader);

    alertEngine.evaluate("BTCUSDT", "49800.0", 1);
    alertEngine.evaluate("BTCUSDT", "49900.0", 2);

    const stillArmed = alertState.definitions.find((a) => a.id === ARMED_BEFORE_RELOAD.id);
    expect(stillArmed?.active).toBe(true);
  });

  describe("FEAT-0387 — the rule engine's own core must load before it is trusted", () => {
    // A live session found this the hard way: `alertEngine.ensureLoaded()`
    // above loads the LEGACY engine's wasm. Nothing loaded the rule
    // evaluator's own core (`ruleSchema`'s), so every evaluation threw
    // `RuleCoreUnavailableError`, caught and logged by the gate — a second,
    // independent instance of exactly this file's bug, invisible to every
    // test that mocks `ruleSchema` instead of exercising its real loader.

    it("loads the rule schema core at startup", async () => {
      const loadSpy = vi.fn(async () => {});
      vi.doMock("../lib/rules/ruleSchema", () => ({
        ruleSchema: { load: loadSpy, isReady: () => true },
      }));

      const { initAlertEngine } = await import("./alerts.svelte");
      await initAlertEngine(fakeLoader);

      expect(loadSpy).toHaveBeenCalledTimes(1);
    });

    it("does not arm the rule loop when the core failed to load", async () => {
      vi.doMock("../lib/rules/ruleSchema", () => ({
        ruleSchema: {
          load: vi.fn(async () => {
            throw new Error("wasm fetch failed");
          }),
          isReady: () => false,
        },
      }));
      const startSpy = vi.fn();
      vi.doMock("../services/alertEngine/ruleLoopWiring", () => ({
        startRuleEvaluationLoop: startSpy,
      }));

      const { initAlertEngine } = await import("./alerts.svelte");

      // A failed core must not abort startup — the legacy engine is the one
      // thing guaranteed to still work, and it must come up regardless.
      await expect(initAlertEngine(fakeLoader)).resolves.toBeUndefined();
      expect(startSpy).not.toHaveBeenCalled();
    });

    it("arms the rule loop, with the notifying sink, once the core is ready", async () => {
      vi.doMock("../lib/rules/ruleSchema", () => ({
        ruleSchema: { load: vi.fn(async () => {}), isReady: () => true },
      }));
      const startSpy = vi.fn();
      vi.doMock("../services/alertEngine/ruleLoopWiring", () => ({
        startRuleEvaluationLoop: startSpy,
      }));

      const { initAlertEngine, notifyingRuleSink } = await import("./alerts.svelte");
      await initAlertEngine(fakeLoader);

      expect(startSpy).toHaveBeenCalledWith(notifyingRuleSink);
    });
  });

  it("does not initialise during SSR", async () => {
    mockEnvironment(false);
    vi.resetModules();

    const { alertEngine } = await import("../services/alertEngine/alertEngine");
    const { initAlertEngine } = await import("./alerts.svelte");

    const loader = vi.fn(fakeLoader);
    await initAlertEngine(loader);

    expect(loader).not.toHaveBeenCalled();
    expect(alertEngine.isLoaded).toBe(false);
  });

  it("can retry after a failed load instead of caching the rejection forever", async () => {
    const { alertEngine } = await import("../services/alertEngine/alertEngine");

    const failing = vi.fn().mockRejectedValue(new Error("wasm 404"));
    await expect(alertEngine.ensureLoaded(failing as never)).rejects.toThrow("wasm 404");
    expect(alertEngine.isLoaded).toBe(false);

    await alertEngine.ensureLoaded(fakeLoader);
    expect(alertEngine.isLoaded).toBe(true);
  });

  describe("a failed load is reported to the user, not just to the log", () => {
    it("marks the engine failed and raises an error toast", async () => {
      const { toastService } = await import("../services/toastService.svelte");
      const { alertState, initAlertEngine } = await import("./alerts.svelte");

      const failing = vi.fn().mockRejectedValue(new Error("wasm 404"));
      await expect(initAlertEngine(failing as never)).rejects.toThrow("wasm 404");

      // Persistent, so the alerts modal can warn a trader who arms an alert
      // long after the startup toast has gone.
      expect(alertState.engineStatus).toBe("failed");
      expect(toastService.error).toHaveBeenCalledWith(
        "dashboard.alerts.engineUnavailable",
      );
    });

    it("keeps definitions on a failed load, so they survive to the next reload", async () => {
      const { alertState, initAlertEngine } = await import("./alerts.svelte");

      const failing = vi.fn().mockRejectedValue(new Error("wasm 404"));
      await expect(initAlertEngine(failing as never)).rejects.toThrow("wasm 404");

      expect(alertState.definitions.map((a) => a.id)).toEqual([ARMED_BEFORE_RELOAD.id]);
    });

    it("reports ready on success, and raises no error toast", async () => {
      const { toastService } = await import("../services/toastService.svelte");
      const { alertState, initAlertEngine } = await import("./alerts.svelte");

      await initAlertEngine(fakeLoader);

      expect(alertState.engineStatus).toBe("ready");
      expect(toastService.error).not.toHaveBeenCalled();
    });

    it("stays idle during SSR — nothing failed, so nothing is reported", async () => {
      mockEnvironment(false);
      vi.resetModules();

      const { toastService } = await import("../services/toastService.svelte");
      const { alertState, initAlertEngine } = await import("./alerts.svelte");

      await initAlertEngine(fakeLoader);

      expect(alertState.engineStatus).toBe("idle");
      expect(toastService.error).not.toHaveBeenCalled();
    });
  });
});
