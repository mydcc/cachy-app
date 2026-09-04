---
id: BUG-0382
title: The price alert engine is never initialised, so no alert ever fires
type: bug
status: specced
priority: P1
milestone: M4
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: []
---

# BUG-0382 — The price alert engine is never initialised, so no alert ever fires

## Symptom

A trader arms a price alert in the alerts modal. The alert is stored, it shows
up in the "active" list, and the price then crosses the level — repeatedly, for
as long as they leave the tab open. No toast appears, the alert stays listed as
active forever, and nothing is written to the alert log.

This is the whole of FEAT-0027 as far as a user can tell. Every alert the
feature has ever been used for has been silently inert in the shipped build
since 1.4.0-beta.6.

## Evidence

**Derived** — read from the code, no incident report. The two pieces that
disagree:

`src/services/alertEngine/alertEngine.ts` gates every public method on an
instance that only one method ever assigns:

```ts
evaluate(symbol: string, currentPriceStr: string, timestamp: number) {
    if (!this.instance) return;
```

The same guard is on `setAlerts`, `addAlert` and `removeAlert`. `this.instance`
is assigned in exactly one place, inside `ensureLoaded()`:

```ts
this.wasmModule = mod;
this.instance = new mod.AlertEngineWasm();
```

`ensureLoaded()` has no call site anywhere in `src/`. Nothing else assigns
`instance`. It is therefore `null` for the entire lifetime of the app, and all
four methods early-return on every call.

The production hot path *is* wired — `src/stores/market/applyUpdate.ts:53`
calls `alertEngine.evaluate(...)` on every `lastPrice` tick — so the call
happens thousands of times per session and does nothing each time. The early
return is silent and returns `undefined`, which is indistinguishable from
"evaluated, no alert matched". That is why this was not noticed.

Second, independent gap: `alertState.syncEngine()`
(`src/stores/alerts.svelte.ts:80`) is the only thing that pushes definitions
rehydrated from `localStorage` into the engine, and it also has no call site.
So even with the engine loaded, alerts armed before a reload would never be
re-registered — only alerts armed in the current session (via `addAlert`)
would reach it.

The WASM side is fine and is not the defect: `AlertEngineWasm` is exported by
the committed glue (`static/wasm/technicals_wasm.js`) and backed by
`technicals-wasm/src/alert_exports.rs`, and the Rust core's own tests pass.
The bug is purely the missing JS-side wiring.

## Cause

The service was written with a lazy-load entry point (`ensureLoaded`) and the
store with a rehydrate hook (`syncEngine`), but neither was ever called from a
startup path. FEAT-0027's acceptance criteria were ticked against the Rust
crate's `cargo test` suite and the service's unit test, and that unit test only
asserts the *guarded* path:

```ts
it('initializes and handles evaluation gracefully if wasm not loaded', () => {
    expect(() => alertEngine.evaluate("BTCUSDT", "60000.0", 1)).not.toThrow();
});
```

It asserts that the broken state does not throw. Nothing anywhere asserted that
the engine ever reaches the loaded state.

## Fix

Call `ensureLoaded()` once at client startup and `syncEngine()` immediately
after it resolves, in that order — the engine must exist before definitions are
pushed into it. `ensureLoaded()` dynamically imports `/wasm/technicals_wasm.js`,
so it must not run during SSR; guard on `browser` from `$app/environment`.

Put the ordering in one exported `initAlertEngine()` in
`src/stores/alerts.svelte.ts` next to the store that owns the definitions,
rather than spreading the two calls across the layout, and call that from
`onMount` in `src/routes/+layout.svelte` alongside the existing
`initAutoBackup()` / `initFileTargets()` calls.

Also reset `loadingPromise` when the load fails, so a failed first attempt does
not permanently cache a rejected promise and make every retry impossible.

Leave alone: the Rust core, the WASM glue, the `applyUpdate.ts` call site (it
is already correct), and the `active` flag semantics. Pushing the full
definition list including already-fired (`active: false`) alerts is safe — the
Rust core filters on `active` in `evaluate` (`alert_engine.rs:86`) and clears it
after firing (line 127), so a reload does not re-fire alert history.

## Acceptance criteria

- [ ] A test reproduces the defect and fails without the fix
- [ ] The test passes with the fix
- [ ] After client startup, the engine instance is loaded rather than null
- [ ] Alerts rehydrated from `localStorage` are pushed into the engine, so an
      alert armed before a reload can still fire
- [ ] A fired event reaches the store and marks the definition inactive
- [ ] Initialisation does not run during SSR
- [ ] FEAT-0027's ticked criterion "An armed alert fires within one candle of
      its condition becoming true" is true in a shipped build

## Links

- `docs/backlog/features/FEAT-0027-alert-engine.md` — marked `status: done`
  with this criterion ticked; that tick was not earned.
- Found while implementing FEAT-0303 (rule schema, #2294), which does not fix
  this.

## Verification (2026-09-04, while planning the Super-Alert work)

Checked against the code on `develop`, criterion by criterion:

| Criterion | Evidence |
|---|---|
| Test reproduces the defect | `src/stores/alerts_engineWiring.test.ts` exists and exercises `initAlertEngine` through a substituted module loader — the seam the fix was designed around |
| Engine loaded after startup | `initAlertEngine()` is called at `src/routes/+layout.svelte:325` |
| Rehydrated alerts reach the engine | `initAlertEngine` calls `alertState.syncEngine()` after `ensureLoaded()` (`src/stores/alerts.svelte.ts:91`) |
| Fired event marks the definition inactive | `alertEngine.onAlertFired` handler in `src/stores/alerts.svelte.ts` |
| No initialisation during SSR | `if (!browser) return` guards the function |

`npx vitest run src/stores/alerts_engineWiring.test.ts src/services/alertEngine/alertEngine.test.ts src/lib/rules/ruleSchema.test.ts` → **3 files, 19 tests, all passing.**

The one criterion **not** verified here is the last one — "an armed alert fires within
one candle in a shipped build" — which needs a running build, not a unit test. Whoever
closes this item should confirm that in the app and then set `status: done`; everything
else is demonstrably in place.

Note also that `engineStatus: "failed"` is surfaced in the UI, and
[`FEAT-0389`](../features/FEAT-0389-super-alert-panel.md) carries that warning forward
into the new panel — a redesign that dropped it would re-open this bug.
