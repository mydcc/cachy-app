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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

/**
 * `vi.resetModules()` clears Vitest's module registry so the next `import()`
 * re-evaluates fresh — but observed flaky in this file even so, in two
 * shapes: (1) a prior test's `initAlertEngine()` call can leave a promise
 * continuation still pending when the next test's synchronous setup runs,
 * settling a beat later against a module instance the next test believed was
 * already fresh; (2) under the `threads` pool, `vi.doMock()` registers its
 * factory over the same worker RPC channel `import()` uses to resolve a
 * specifier — a mock call made in a test body can still be in flight on that
 * channel when the very next `import()` asks for the same module, so it
 * resolves against whatever factory was already registered instead of this
 * test's. A single macrotask tick fixed most of this but not all of it
 * (2 failures in 15 runs); a short real delay gives the RPC round trip room
 * to land before the import that depends on it.
 */
const resetModulesAndFlush = async () => {
  vi.resetModules();
  await new Promise((resolve) => setTimeout(resolve, 10));
};

/**
 * Re-imports `./alerts.svelte` fresh, for every test that then calls
 * `initAlertEngine()` — not just the SSR ones.
 *
 * Always resets and flushes before importing, rather than only on retry: a
 * prior test's `initAlertEngine()` call can leave a promise continuation
 * still pending when the next test's synchronous setup runs, and it settles
 * a beat later against a module instance the next test believed was already
 * fresh — a reset is what actually orphans that continuation onto the *old*
 * module instance instead of corrupting the new one.
 *
 * This does mean a reference a test already captured before calling this —
 * `const { alertEngine } = await import(...)` — is orphaned by the reset:
 * such tests must do that import *after* this one, so both come from the
 * same post-reset module graph. Every call site in this file follows that
 * order.
 *
 * Only accepts the result once the freshly imported `alertState` reports
 * "idle" — the value only a genuinely new singleton starts with. Throws with
 * a clear message on the (so far unobserved) case where it never settles,
 * rather than letting a stale module silently masquerade as a fresh one.
 */
async function importFreshAlertsModule(): Promise<typeof import("./alerts.svelte")> {
  const modulePath = "./alerts.svelte"; // kept out of the literal `import("./alerts.svelte")` shape on purpose, so a project-wide search-and-replace of that call cannot turn this primitive into infinite recursion on itself
  for (let attempt = 0; attempt < 5; attempt++) {
    await resetModulesAndFlush();
    const mod = await import(modulePath);
    if (mod.alertState.engineStatus === "idle") return mod;
  }
  throw new Error(
    "alerts.svelte's alertState singleton did not settle to a fresh 'idle' state after several reset attempts",
  );
}

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

/**
 * `ruleSchema` and `ruleLoopWiring` as static, module-scope mocks rather than
 * a `vi.doMock` per test.
 *
 * Both are reached by `initAlertEngine()` through a *dynamic* `import()`
 * inside the function body — not a static top-level import — because that is
 * how the real module keeps this test's SSR path out of the client-only
 * import graph. Under the `threads` pool, `vi.doMock()` registers its factory
 * over the same worker RPC channel `import()` uses to resolve a specifier: a
 * `doMock` call made in a test body could still be in flight on that channel
 * when the dynamic `import()` inside `initAlertEngine` asked for the same
 * module moments later, so it occasionally resolved against whichever
 * factory was already registered instead of this test's — a real, if rare,
 * flake (observed CI failures on "arms the rule loop…" and "shadow mode…"
 * mid-session tests, at rates from 2/15 to 1/20 runs even after tuning the
 * settle delay between `vi.resetModules()` and the next import).
 *
 * A `vi.mock()` factory registered once, here, is not subject to that race:
 * it is established during collection, long before any test's dynamic
 * import runs, and survives `vi.resetModules()` untouched — only the
 * *values* these shared spies return need to vary per test, which is plain
 * synchronous mock configuration (`mockReturnValue`/`mockImplementation`),
 * not a fresh module registration. Referenced from inside a `vi.mock`
 * factory, so every name has to start with `mock` — Vitest's own
 * hoisting-safety rule for that.
 */
const mockRuleSchemaLoad = vi.fn(async () => {});
const mockRuleSchemaIsReady = vi.fn(() => false);
vi.mock("../lib/rules/ruleSchema", () => ({
  ruleSchema: { load: mockRuleSchemaLoad, isReady: mockRuleSchemaIsReady },
}));

const mockIsSeriesObserved = vi.fn(() => false);
const mockLedgerSink = vi.fn();
const mockStartRuleEvaluationLoop = vi.fn();
vi.mock("../services/alertEngine/ruleLoopWiring", () => ({
  isSeriesObserved: mockIsSeriesObserved,
  ledgerSink: mockLedgerSink,
  startRuleEvaluationLoop: mockStartRuleEvaluationLoop,
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
  beforeEach(async () => {
    await resetModulesAndFlush();
    vi.clearAllMocks();
    mockEnvironment(true);

    // `vi.clearAllMocks()` above only clears call history, not the
    // implementations these shared mocks were given by whichever test ran
    // before this one — reassert the neutral default every test, exactly the
    // way a real, un-mocked `ruleSchema` behaves in this environment (wasm
    // never loads under Node/Vitest, so `isReady()` is `false`). A test that
    // needs different behaviour overrides these same mocks in its own body,
    // same as the SSR tests override `mockEnvironment`.
    mockRuleSchemaLoad.mockImplementation(async () => {});
    mockRuleSchemaIsReady.mockReturnValue(false);
    mockIsSeriesObserved.mockReturnValue(false);
    mockLedgerSink.mockImplementation(() => {});
    mockStartRuleEvaluationLoop.mockImplementation(() => {});

    localStorage.clear();
    localStorage.setItem(STORAGE_KEY, JSON.stringify([ARMED_BEFORE_RELOAD]));
    // The fake engine mutates its own alert objects when they fire; hand each
    // test a fresh copy so one test's fired alert cannot arrive still-fired.
    ARMED_BEFORE_RELOAD.active = true;
  });

  // The timer tests below replace the global `setInterval`/`clearInterval`
  // with `vi.spyOn`; without this they would stay replaced for every test
  // that follows.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("leaves the engine unloaded until something initialises it", async () => {
    const { alertEngine } = await import("../services/alertEngine/alertEngine");

    // The state the bug shipped in — kept as an explicit baseline so the
    // assertions below are known to be measuring the transition.
    expect(alertEngine.isLoaded).toBe(false);
  });

  it("loads the engine at startup so evaluation is no longer a silent no-op", async () => {
    const { initAlertEngine } = await importFreshAlertsModule();
    const { alertEngine } = await import("../services/alertEngine/alertEngine");

    await initAlertEngine(fakeLoader);

    // Fails without the fix: nothing ever called ensureLoaded(), so the
    // instance stayed null and evaluate() early-returned on every tick.
    expect(alertEngine.isLoaded).toBe(true);
  });

  it("re-registers alerts rehydrated from localStorage", async () => {
    const { initAlertEngine } = await importFreshAlertsModule();

    await initAlertEngine(fakeLoader);

    // Fails without the fix: syncEngine() had no call site, so an alert armed
    // before a reload never reached the engine.
    expect(fakeInstance.alerts.map((a) => a.id)).toEqual([ARMED_BEFORE_RELOAD.id]);
  });

  it("fires an alert armed before reload, and the event reaches the store", async () => {
    const { alertState, initAlertEngine } = await importFreshAlertsModule();
    const { alertEngine } = await import("../services/alertEngine/alertEngine");

    await initAlertEngine(fakeLoader);

    // Seed the previous price, then cross the 50000.0 level upwards.
    alertEngine.evaluate("BTCUSDT", "49900.0", 1);
    alertEngine.evaluate("BTCUSDT", "50100.0", 2);

    const fired = alertState.definitions.find((a) => a.id === ARMED_BEFORE_RELOAD.id);
    expect(fired?.active).toBe(false);
  });

  it("does not fire an alert whose level was never crossed", async () => {
    const { alertState, initAlertEngine } = await importFreshAlertsModule();
    const { alertEngine } = await import("../services/alertEngine/alertEngine");

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
      const { initAlertEngine } = await importFreshAlertsModule();
      await initAlertEngine(fakeLoader);

      expect(mockRuleSchemaLoad).toHaveBeenCalledTimes(1);
    });

    it("does not arm the rule loop when the core failed to load", async () => {
      mockRuleSchemaLoad.mockImplementation(async () => {
        throw new Error("wasm fetch failed");
      });
      mockRuleSchemaIsReady.mockReturnValue(false);

      const { initAlertEngine } = await importFreshAlertsModule();

      // A failed core must not abort startup — the legacy engine is the one
      // thing guaranteed to still work, and it must come up regardless.
      await expect(initAlertEngine(fakeLoader)).resolves.toBeUndefined();
      expect(mockStartRuleEvaluationLoop).not.toHaveBeenCalled();
    });

    it("arms the rule loop, with the notifying sink, once the core is ready", async () => {
      mockRuleSchemaIsReady.mockReturnValue(true);
      mockIsSeriesObserved.mockReturnValue(true);

      const { initAlertEngine, notifyingRuleSink } = await importFreshAlertsModule();
      await initAlertEngine(fakeLoader);

      // A second argument (the mid-session re-sync hook) is expected in live
      // mode; its own behaviour is covered separately below.
      expect(mockStartRuleEvaluationLoop).toHaveBeenCalledWith(notifyingRuleSink, expect.any(Function));
    });
  });

  describe("FEAT-0387 — the shadow-mode rollback must actually be a pure addition", () => {
    // A live session's own review found this: coverage was computed the same
    // way regardless of which sink armed the loop, so `ledgerSink` — which
    // records and notifies nobody — left a covered alert served by *neither*
    // engine. That is BUG-0382 exactly, reached through a "rollback" that was
    // supposed to be the safe direction.

    function seedCoveredRule() {
      localStorage.setItem(
        "cachy_rules_v1",
        JSON.stringify([
          {
            id: ARMED_BEFORE_RELOAD.id,
            symbol: ARMED_BEFORE_RELOAD.symbol,
            trigger_timeframe: "1m",
            enabled: true,
          },
        ]),
      );
      localStorage.setItem(
        "cachy_rule_origin_v1",
        JSON.stringify({
          schema_version: 1,
          entries: {
            [ARMED_BEFORE_RELOAD.id]: {
              alertId: ARMED_BEFORE_RELOAD.id,
              migratedAtMs: 1_757_030_400_000,
            },
          },
        }),
      );
    }

    it("shadow mode keeps a covered alert on the legacy engine", async () => {
      seedCoveredRule();
      mockRuleSchemaIsReady.mockReturnValue(true);
      mockIsSeriesObserved.mockReturnValue(true);

      const { initAlertEngine } = await importFreshAlertsModule();
      await initAlertEngine(fakeLoader, "shadow");

      // Fails on the un-fixed code: coverage was computed the same way
      // regardless of mode, so this alert would already be missing from the
      // legacy engine here — served by neither, since ledgerSink notifies
      // nobody.
      expect(fakeInstance.alerts.map((a) => a.id)).toContain(ARMED_BEFORE_RELOAD.id);
    });

    it("shadow mode arms the loop with the recording sink, not the notifying one", async () => {
      seedCoveredRule();
      mockRuleSchemaIsReady.mockReturnValue(true);
      mockIsSeriesObserved.mockReturnValue(true);

      const { initAlertEngine } = await importFreshAlertsModule();
      await initAlertEngine(fakeLoader, "shadow");

      // undefined, not a re-sync function: shadow mode must not touch legacy
      // coverage at all, mid-session included.
      expect(mockStartRuleEvaluationLoop).toHaveBeenCalledWith(mockLedgerSink, undefined);
    });

    it("live mode (the default) does remove a covered alert from the legacy engine", async () => {
      // The contrast case: same seeded coverage, no mode argument — proves
      // the two tests above are about the mode switch, not about coverage
      // never applying at all.
      seedCoveredRule();
      mockRuleSchemaIsReady.mockReturnValue(true);
      mockIsSeriesObserved.mockReturnValue(true);

      const { initAlertEngine } = await importFreshAlertsModule();
      await initAlertEngine(fakeLoader);

      expect(fakeInstance.alerts.map((a) => a.id)).not.toContain(ARMED_BEFORE_RELOAD.id);
    });
  });

  describe("FEAT-0387 — coverage stays in step with series observed mid-session", () => {
    // Round 3's finding: coverage was a startup snapshot, but the notifying
    // loop is armed for the whole session and is series-driven. A rule whose
    // series only becomes observed after init would stay covered by neither
    // engine's fresh knowledge. Round 4 found the mirror case: a series
    // observed at init that later goes quiet (trader switches charts) leaves
    // a covered rule evaluated by nothing, since round 3's fix alone reacted
    // to a series starting, not to one stopping. Both directions are the same
    // re-sync mechanism; these tests exercise it each way.

    function seedCoveredRule() {
      localStorage.setItem(
        "cachy_rules_v1",
        JSON.stringify([
          {
            id: ARMED_BEFORE_RELOAD.id,
            symbol: ARMED_BEFORE_RELOAD.symbol,
            trigger_timeframe: "1m",
            enabled: true,
          },
        ]),
      );
      localStorage.setItem(
        "cachy_rule_origin_v1",
        JSON.stringify({
          schema_version: 1,
          entries: {
            [ARMED_BEFORE_RELOAD.id]: {
              alertId: ARMED_BEFORE_RELOAD.id,
              migratedAtMs: 1_757_030_400_000,
            },
          },
        }),
      );
    }

    it("re-syncs the legacy engine when the rule's series is later observed", async () => {
      // Not observed at startup: the alert stays on the legacy engine from
      // the initial sync, same as any uncovered alert.
      seedCoveredRule();
      mockRuleSchemaIsReady.mockReturnValue(true);
      let observed = false;
      mockIsSeriesObserved.mockImplementation(() => observed);
      let capturedOnClose: (() => void) | undefined;
      mockStartRuleEvaluationLoop.mockImplementation((_sink: unknown, onClose?: () => void) => {
        capturedOnClose = onClose;
      });

      const { initAlertEngine } = await importFreshAlertsModule();
      await initAlertEngine(fakeLoader);

      // Fails without the fix: the alert was never covered, so this asserts
      // the baseline the rest of the test builds on.
      expect(fakeInstance.alerts.map((a) => a.id)).toContain(ARMED_BEFORE_RELOAD.id);
      expect(capturedOnClose).toBeInstanceOf(Function);

      // The series becomes observed mid-session (a chart opened, an
      // indicator subscribed) and the loop reports a close.
      observed = true;
      capturedOnClose?.();

      // Fails on the un-fixed code: nothing re-ran syncEngine, so the alert
      // would still be sitting on the legacy engine while the rule path — armed
      // since startup — now also evaluates and notifies for it.
      expect(fakeInstance.alerts.map((a) => a.id)).not.toContain(ARMED_BEFORE_RELOAD.id);
    });

    it("returns the alert to the legacy engine when its series goes quiet", async () => {
      // Review round 4's finding, the mirror of the test above: a series
      // that was observed at startup (chart on 1m) can stop being observed
      // mid-session (trader switches to 4h) without the market store ever
      // clearing the candles it already has — a length-based `isSeriesObserved`
      // would keep reporting "observed" forever. This test does not need the
      // real recency logic (ruleLoopWiring.test.ts covers that); it only
      // needs `isSeriesObserved` to report the honest answer and proves
      // `alerts.svelte.ts`'s own re-sync reacts to it correctly either way.
      seedCoveredRule();
      mockRuleSchemaIsReady.mockReturnValue(true);
      let observed = true;
      mockIsSeriesObserved.mockImplementation(() => observed);
      let capturedOnClose: (() => void) | undefined;
      mockStartRuleEvaluationLoop.mockImplementation((_sink: unknown, onClose?: () => void) => {
        capturedOnClose = onClose;
      });

      const { initAlertEngine } = await importFreshAlertsModule();
      await initAlertEngine(fakeLoader);

      // Observed at startup: covered, so taken off the legacy engine.
      expect(fakeInstance.alerts.map((a) => a.id)).not.toContain(ARMED_BEFORE_RELOAD.id);

      // The subscription drops (trader switched charts) and some other
      // series' close still drives the loop, triggering a re-sync.
      observed = false;
      capturedOnClose?.();

      // Fails without the fix: the alert would stay off the legacy engine —
      // armed in the trader's mind, evaluated by neither engine, since the
      // rule path's own series produces no more closes to evaluate it with.
      expect(fakeInstance.alerts.map((a) => a.id)).toContain(ARMED_BEFORE_RELOAD.id);
    });

    /**
     * Captures the re-sync timer instead of letting one run.
     *
     * A real 60-second interval would outlive the test that created it and
     * then re-sync an orphaned module's `alertState` against the *next*
     * test's storage — the timer under test becoming a source of flake in
     * the suite that tests it.
     */
    function captureResyncTimer() {
      const registered: Array<{ tick: () => void; intervalMs: number | undefined }> = [];
      const cleared: unknown[] = [];
      let nextHandle = 1;

      vi.spyOn(globalThis, "setInterval").mockImplementation(((tick: () => void, intervalMs?: number) => {
        registered.push({ tick, intervalMs });
        return nextHandle++;
      }) as never);
      vi.spyOn(globalThis, "clearInterval").mockImplementation(((handle: unknown) => {
        cleared.push(handle);
      }) as never);

      // Only the coverage re-sync: anything else on the startup path that
      // happens to schedule an interval is not this test's subject.
      const resyncs = () => registered.filter((r) => r.intervalMs === COVERAGE_RESYNC_INTERVAL_MS);
      return { resyncs, cleared };
    }

    /** Mirrors `COVERAGE_RESYNC_INTERVAL_MS`, which the store does not export. */
    const COVERAGE_RESYNC_INTERVAL_MS = 60_000;

    it("re-syncs coverage on a timer, for the series that stops closing", async () => {
      // Round 5's finding, fixed rather than documented: `onClose` fires only
      // when *some* series closes. A trader charting only 4h whose 1m rule
      // series goes quiet has no 1m close left to notice it with, and the next
      // 4h close can be four hours away — for that whole window the alert is
      // off the legacy engine and evaluated by nothing. This test never calls
      // `onClose` at all; the timer alone has to bring the alert back.
      seedCoveredRule();
      mockRuleSchemaIsReady.mockReturnValue(true);
      let observed = true;
      mockIsSeriesObserved.mockImplementation(() => observed);
      const { resyncs } = captureResyncTimer();

      const { initAlertEngine } = await importFreshAlertsModule();
      await initAlertEngine(fakeLoader);

      // Observed at startup: covered, so off the legacy engine.
      expect(fakeInstance.alerts.map((a) => a.id)).not.toContain(ARMED_BEFORE_RELOAD.id);
      expect(resyncs()).toHaveLength(1);

      // The subscription drops, and no close arrives from any series.
      observed = false;
      resyncs()[0].tick();

      // Fails without the timer: nothing would run until the next close, which
      // on a quiet 1m series and a 4h chart is up to four hours away.
      expect(fakeInstance.alerts.map((a) => a.id)).toContain(ARMED_BEFORE_RELOAD.id);
    });

    it("shadow mode starts no re-sync timer", async () => {
      // Same reason shadow mode gets no `onClose`: a re-sync there would strip
      // alerts from the legacy engine for a sink that notifies nobody.
      seedCoveredRule();
      mockRuleSchemaIsReady.mockReturnValue(true);
      mockIsSeriesObserved.mockReturnValue(true);
      const { resyncs } = captureResyncTimer();

      const { initAlertEngine } = await importFreshAlertsModule();
      await initAlertEngine(fakeLoader, "shadow");

      expect(resyncs()).toHaveLength(0);
    });

    it("starts no re-sync timer when the rule core never loaded", async () => {
      // Coverage is empty without a ready evaluator, so a timer would do
      // nothing but log a warning once a minute for the life of the tab.
      seedCoveredRule();
      mockRuleSchemaIsReady.mockReturnValue(false);
      const { resyncs } = captureResyncTimer();

      const { initAlertEngine } = await importFreshAlertsModule();
      await initAlertEngine(fakeLoader);

      expect(resyncs()).toHaveLength(0);
    });

    it("replaces the re-sync timer on a second init rather than stacking one", async () => {
      seedCoveredRule();
      mockRuleSchemaIsReady.mockReturnValue(true);
      mockIsSeriesObserved.mockReturnValue(true);
      const { resyncs, cleared } = captureResyncTimer();

      const { initAlertEngine } = await importFreshAlertsModule();
      await initAlertEngine(fakeLoader);
      await initAlertEngine(fakeLoader);

      // Two registrations, and the first one cleared — not two live timers
      // both re-syncing the same coverage every minute.
      expect(resyncs()).toHaveLength(2);
      expect(cleared).toContain(1);
    });

    it("shadow mode never wires the re-sync hook, even once ready", async () => {
      seedCoveredRule();
      mockRuleSchemaIsReady.mockReturnValue(true);
      mockIsSeriesObserved.mockReturnValue(true);

      const { initAlertEngine } = await importFreshAlertsModule();
      await initAlertEngine(fakeLoader, "shadow");

      // A resync hook in shadow mode would start removing alerts from the
      // legacy engine on behalf of a sink that never notifies for them —
      // recreating the exact gap the mode split exists to close.
      expect(mockStartRuleEvaluationLoop.mock.calls[0][1]).toBeUndefined();
    });
  });

  it("does not initialise during SSR", async () => {
    mockEnvironment(false);
    await resetModulesAndFlush();

    const { initAlertEngine } = await importFreshAlertsModule();
    const { alertEngine } = await import("../services/alertEngine/alertEngine");

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
      const { alertState, initAlertEngine } = await importFreshAlertsModule();

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
      const { alertState, initAlertEngine } = await importFreshAlertsModule();

      const failing = vi.fn().mockRejectedValue(new Error("wasm 404"));
      await expect(initAlertEngine(failing as never)).rejects.toThrow("wasm 404");

      expect(alertState.definitions.map((a) => a.id)).toEqual([ARMED_BEFORE_RELOAD.id]);
    });

    it("reports ready on success, and raises no error toast", async () => {
      const { toastService } = await import("../services/toastService.svelte");
      const { alertState, initAlertEngine } = await importFreshAlertsModule();

      await initAlertEngine(fakeLoader);

      expect(alertState.engineStatus).toBe("ready");
      expect(toastService.error).not.toHaveBeenCalled();
    });

    it("stays idle during SSR — nothing failed, so nothing is reported", async () => {
      mockEnvironment(false);
      await resetModulesAndFlush();

      const { toastService } = await import("../services/toastService.svelte");
      const { alertState, initAlertEngine } = await importFreshAlertsModule();

      await initAlertEngine(fakeLoader);

      expect(alertState.engineStatus).toBe("idle");
      expect(toastService.error).not.toHaveBeenCalled();
    });
  });
});
