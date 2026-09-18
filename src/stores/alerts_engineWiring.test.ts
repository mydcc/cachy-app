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
 * "idle" — the value only a genuinely new singleton starts with — *and* the
 * `$app/environment` of the same post-reset module graph carries this test's
 * `browser` flag. `idle` alone does not prove the module is ours: a fresh
 * instance baked with the *previous* test's environment still reports "idle"
 * and then runs the loader it should have skipped (SSR tests), or skips the
 * load under test (browser tests). Throws with a clear message instead of
 * letting such a module silently masquerade as a fresh one.
 */
async function importFreshAlertsModule(
  expectedBrowser = true,
): Promise<typeof import("./alerts.svelte")> {
  const modulePath = "./alerts.svelte"; // kept out of the literal `import("./alerts.svelte")` shape on purpose, so a project-wide search-and-replace of that call cannot turn this primitive into infinite recursion on itself
  for (let attempt = 0; attempt < 5; attempt++) {
    // Re-register this test's factory every attempt, not just once in the
    // body: the registration travels over worker RPC, so an import may
    // resolve `$app/environment` against whatever factory was already
    // registered (usually `browser: true` from `beforeEach`).
    mockEnvironment(expectedBrowser);
    await resetModulesAndFlush();
    const mod = await import(modulePath);
    const env = await import("$app/environment");
    if (mod.alertState.engineStatus === "idle" && env.browser === expectedBrowser) return mod;
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

const RULES_KEY = "cachy_rules_v1";
const ALERTS_KEY = "cachy_alerts_v1";
const MIGRATED_KEY = "cachy_alerts_migrated_v1";
const ORIGIN_KEY = "cachy_rule_origin_v1";
const HANDOFF_KEY = "cachy_alerts_handoff_v1";

const ruleDoc = (overrides: Record<string, unknown> = {}) => ({
  schema_version: 2,
  id: "rule-a",
  symbol: "BTCUSDT",
  trigger_timeframe: "1m",
  enabled: true,
  conditions: { kind: "compare", left: { kind: "price" }, op: "gte", right: { kind: "constant", value: "50000" }, timeframe: "1m" },
  action: { consequence_level: "notify" },
  provenance: { source: "human", created_at_ms: 1 },
  ...overrides,
});

/**
 * Imports a provably fresh `alerts.svelte` and runs its startup.
 *
 * Goes through `importFreshAlertsModule` rather than a bare `import()`: the
 * store's `alertState` is a module singleton, so a stale instance baked with
 * the previous test's `browser` flag would pass or fail for reasons that have
 * nothing to do with what the test is measuring.
 */
async function init(mode?: "live" | "shadow", expectedBrowser = true) {
  const mod = await importFreshAlertsModule(expectedBrowser);
  await mod.initAlertEngine(mode);
  return mod;
}

/*
 * FEAT-0399 rewrote this file. It used to cover the legacy `AlertEngineWasm`
 * startup (BUG-0382), the legacy candle replay (BUG-0441, BUG-0448) and the
 * coverage split that kept exactly one of two engines serving each alert
 * (FEAT-0387). All three are gone with the engine they belonged to, so those
 * tests were removed rather than skipped. What survives is what
 * `initAlertEngine()` still promises: an ordered startup, and an evaluator
 * that either runs or says out loud that it does not.
 */
describe("FEAT-0399 — rule engine startup wiring", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    mockRuleSchemaIsReady.mockReturnValue(true);
    mockRuleSchemaLoad.mockResolvedValue(undefined);
    mockStartRuleEvaluationLoop.mockReturnValue(() => {});
    mockEnvironment(true);
    await resetModulesAndFlush();
  });

  afterEach(() => {
    vi.doUnmock("$app/environment");
  });

  it("does nothing during SSR", async () => {
    await init("live", false);

    expect(mockStartRuleEvaluationLoop).not.toHaveBeenCalled();
  });

  it("arms the loop with the notifying sink in live mode", async () => {
    await init();

    expect(mockStartRuleEvaluationLoop).toHaveBeenCalledTimes(1);
    expect(mockStartRuleEvaluationLoop.mock.calls[0][0]).not.toBe(mockLedgerSink);
  });

  it("arms the loop with the recording sink in shadow mode", async () => {
    // The identity matters, not merely the mode: `startRuleEvaluationLoop`
    // checks `onFiring === ledgerSink` to know it must not notify, so a
    // decorator around the sink would silently turn a measurement run into a
    // live one.
    await init("shadow");

    expect(mockStartRuleEvaluationLoop.mock.calls[0][0]).toBe(mockLedgerSink);
  });

  it("reports ready once the core has loaded", async () => {
    const { alertState } = await init();

    expect(alertState.engineStatus).toBe("ready");
  });

  it("says so instead of arming when the core is not ready", async () => {
    // BUG-0382's surviving half: a stored alarm that nothing evaluates must
    // not look armed. With the legacy engine gone there is no second engine
    // to fall back to, so this is the only thing standing between the trader
    // and silence.
    mockRuleSchemaIsReady.mockReturnValue(false);
    const { alertState } = await init();

    expect(alertState.engineStatus).toBe("failed");
    expect(mockStartRuleEvaluationLoop).not.toHaveBeenCalled();
  });

  it("still reports failed when the core load itself rejects", async () => {
    mockRuleSchemaLoad.mockRejectedValue(new Error("fetch failed"));
    mockRuleSchemaIsReady.mockReturnValue(false);
    const { alertState } = await init();

    expect(alertState.engineStatus).toBe("failed");
  });

  it("stops the previous run's loop before arming a second one", async () => {
    const disarm = vi.fn();
    mockStartRuleEvaluationLoop.mockReturnValueOnce(disarm).mockReturnValueOnce(() => {});
    const { initAlertEngine } = await importFreshAlertsModule();

    await initAlertEngine();
    await initAlertEngine();

    expect(disarm).toHaveBeenCalledTimes(1);
    expect(mockStartRuleEvaluationLoop).toHaveBeenCalledTimes(2);
  });

  it("stops the loop when the core stops being ready mid-session", async () => {
    const disarm = vi.fn();
    mockStartRuleEvaluationLoop.mockReturnValue(disarm);
    const { alertState } = await init();
    const onClose = mockStartRuleEvaluationLoop.mock.calls[0][1] as () => void;

    mockRuleSchemaIsReady.mockReturnValue(false);
    onClose();

    expect(disarm).toHaveBeenCalledTimes(1);
    expect(alertState.engineStatus).toBe("failed");
  });

  it("does not hand the market hot path a close hook in shadow mode", async () => {
    await init("shadow");

    expect(mockStartRuleEvaluationLoop.mock.calls[0][1]).toBeUndefined();
  });
});

describe("FEAT-0399 — the startup order the legacy retirement depends on", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    mockRuleSchemaIsReady.mockReturnValue(true);
    mockRuleSchemaLoad.mockResolvedValue(undefined);
    mockStartRuleEvaluationLoop.mockReturnValue(() => {});
    mockEnvironment(true);
    await resetModulesAndFlush();
  });

  afterEach(() => {
    vi.doUnmock("$app/environment");
  });

  it("verifies the legacy store against the migration ledger", async () => {
    localStorage.setItem(ALERTS_KEY, JSON.stringify([{ id: "a1", active: true }]));
    localStorage.setItem(MIGRATED_KEY, JSON.stringify(["a1"]));

    const { alertState } = await init();

    expect(alertState.legacyMigrationReport).toMatchObject({ verdict: "clean", legacyCount: 1 });
  });

  it("names a legacy alert that never became a rule", async () => {
    // The hazard FEAT-0399 opens: this alert is evaluated by nothing now.
    localStorage.setItem(ALERTS_KEY, JSON.stringify([{ id: "stranded", active: true }]));

    const { alertState } = await init();

    expect(alertState.legacyMigrationReport).toMatchObject({
      verdict: "unmigrated",
      unmigrated: ["stranded"],
    });
  });

  it("stays quiet on a device that never had legacy alerts", async () => {
    const { alertState } = await init();

    expect(alertState.legacyMigrationReport).toBeNull();
  });

  it("re-arms an alarm the old cutover parked, once", async () => {
    localStorage.setItem(ALERTS_KEY, JSON.stringify([{ id: "a1", active: true }]));
    localStorage.setItem(MIGRATED_KEY, JSON.stringify(["a1"]));
    localStorage.setItem(RULES_KEY, JSON.stringify([ruleDoc({ id: "r1", enabled: false })]));
    localStorage.setItem(
      ORIGIN_KEY,
      JSON.stringify({ schema_version: 1, entries: { r1: { alertId: "a1", migratedAtMs: 1 } } }),
    );

    await init();

    expect(JSON.parse(localStorage.getItem(RULES_KEY)!)[0].enabled).toBe(true);
    expect(localStorage.getItem(HANDOFF_KEY)).not.toBeNull();
  });
});
