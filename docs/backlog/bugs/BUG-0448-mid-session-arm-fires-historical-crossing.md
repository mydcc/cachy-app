---
id: BUG-0448
title: An alert armed mid-session on a still-pending legacy symbol can fire from a historical crossing
type: bug
status: done
assignee: claude
priority: P2
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: []
---

# BUG-0448 — An alert armed mid-session on a still-pending legacy symbol can fire from a historical crossing

## Symptom

A trader opens the app. The legacy alert engine's startup replay cannot run for
`BTCUSDT` yet because its klines have not arrived, so the symbol stays *pending* in
`legacyReplayCoordinator`. Before any history lands — or before the symbol's first live
tick — the trader arms a new alert B ("BTCUSDT crosses 70 000") at a price of 66 000.
When the symbol's history finally becomes observable, the replay feeds its recent closes
through the engine and one of the historical pairs straddles B's target. B fires
immediately, for a crossing that happened before it existed and that the trader never saw.

The same happens on the pre-evaluation path: the first live tick calls
`replayBeforeLegacyEvaluation(symbol)`, which replays the whole engine's alert set for
that symbol — including B, armed seconds earlier.

## Evidence

**Derived**, from the interaction of two pieces of code that disagree about *which*
alerts a replay may decide:

- The replay is engine-wide for a symbol. `alertEngine.evaluate`
  (`technicals-wasm/src/alert_engine.rs`) evaluates every alert the engine holds for that
  symbol, not a caller-specified subset — `legacyReplayCoordinator.ts`'s
  `configureLegacyReplay().evaluate` forwards straight into it.
- The coordinator's pending set is a snapshot taken once at startup:
  `setPendingLegacyReplaySymbols(alertsForLegacyEngine(alertState.definitions, covered).map(a => a.symbol))`
  (`src/stores/alerts.svelte.ts`, `initAlertEngine`). An alert armed later is in the
  engine but not in that snapshot's *intent* — yet the replay still reaches it, because
  evaluation is symbol-scoped.

So a symbol that was pending at startup acts as a trap for any alert armed on it before
the replay runs.

Documented as the "third, mid-session variant" of BUG-0441's known limitations; this item
exists so it is tracked as work rather than only as prose inside a `done` record.

## Cause

Two lifetimes are conflated. The replay decides a *symbol* ("this symbol's ordering
window is now closed"), but the thing it can affect is an *alert set*. An alert created
after the snapshot is evaluated by the replay even though it was never part of the
population the replay was justified for — the alerts that survived a reload.

The engine exposes no rollback or `set_alerts` path, so the replay cannot be undone once
`evaluate` has seeded the baseline and possibly flipped `alert.active`.

## Fix

Implemented as the first candidate, without a WASM change. The core never needed a subset
call: its `add_alert`/`remove_alert` exports already let the TypeScript service take an
alert out and put it back, and "the engine exposes no `set_alerts` path" above was wrong —
what it lacks is a way to *read* its set, so the service now mirrors it.

- **`alertEngine.ts`** keeps `held`, a copy of what the core holds, moved only after the
  core accepted a change and flipped to `active: false` when `evaluate` reports a firing.
  `withAlertsWithheld(ids, run)` removes the ids it actually holds, runs, and puts back
  exactly those — never one it did not hold, so a rule-covered alert cannot land on both
  engines.
- **`legacyReplayCoordinator.ts`** takes the population as alerts, not symbols
  (`setLegacyReplayPopulation`). Every replay withholds the alerts the engine holds for its
  symbols that are not a population member — same id *and* same condition, so a survivor
  whose level was moved before its history arrived counts as newly armed.
- **`alerts.svelte.ts`** passes the startup legacy set as the population and wires the two
  service methods into the replay source, where they are required fields.

Leave alone: the startup replay itself and the ordering guarantee; this is a scoping
defect, not a timing one.

### Known limitation

A withheld alert goes back into an engine whose crossing baseline is the last replayed
close, not the price at the moment it was armed. Its first live tick therefore compares
against a close up to one candle (of the finest timeframe the symbol has history in) older
than the arming, so a level already crossed inside
that still-open candle can fire it. That window is one candle, against the whole replayed
history before the fix; closing it needs a per-alert baseline the core does not have.

## Acceptance criteria

- [x] A test reproduces the defect: a symbol pending at `initAlertEngine`, a second alert
      armed on it before history arrives, history replayed — the second alert must not
      fire (`alerts_engineWiring.test.ts`, "BUG-0448", on both the history-observed and
      the first-live-tick path; red before the fix)
- [x] The same test passes with the fix
- [x] An alert that survived a reload still fires from its historical crossing
      (BUG-0441's behaviour is preserved, not traded away)
- [x] If the fix needs a WASM change, `static/wasm` is rebuilt in the same PR — not
      needed, no Rust change

## Out of scope

- The first-timeframe-window and not-deferred residuals of BUG-0441's "Known limitation"
  — those are separate mechanisms with the same no-rollback constraint.

## Progress

- 2026-09-14 — claimed on branch `fix/bug-0448-mid-session-arm-replay`.
- 2026-09-14 — fixed in TypeScript by withholding non-population alerts during a replay.

## Links

- [`BUG-0441`](BUG-0441-legacy-alert-cold-baseline-never-fires.md) — the replay this
  scoping defect sits in; its "Known limitation" third variant is this item
- `src/services/alertEngine/legacyReplayCoordinator.ts` — `configureLegacyReplay`,
  `replayBeforeLegacyEvaluation`, `setPendingLegacyReplaySymbols`
- `src/stores/alerts.svelte.ts` — `initAlertEngine`, where the pending snapshot is taken
- `src/stores/market/applyUpdate.ts` — the pre-evaluation replay call
- `technicals-wasm/src/alert_engine.rs` — `AlertEngine::evaluate`, engine-wide per symbol
