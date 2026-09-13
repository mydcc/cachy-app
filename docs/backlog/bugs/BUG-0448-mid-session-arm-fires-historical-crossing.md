---
id: BUG-0448
title: An alert armed mid-session on a still-pending legacy symbol can fire from a historical crossing
type: bug
status: specced
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

Not implemented in this item's filing PR (BUG-0441's restore). Candidate approaches, none
free:

- **Per-alert replay.** Feed the engine only the alerts that were armed before the
  session, via a `set_alerts`/subset call the engine does not currently expose. Correct,
  but needs a Rust/WASM change plus a rebuilt `static/wasm` artefact.
- **Snapshot the armed set at replay time and skip a symbol whose set grew.** Closest to
  shippable in TypeScript, but it takes the legitimate reload-survivor alert A down with
  the trap alert B — the exact population BUG-0441 targets — so it trades a false fire
  for a missed fire, which is not obviously better.
- **Arm-time watermark.** Record the wall-clock time an alert was created and have the
  replay ignore a close whose `open_time_ms` precedes it. Requires the alert model to
  carry creation time and the engine to compare timestamps it currently ignores.

Leave alone: the startup replay itself and the ordering guarantee; this is a scoping
defect, not a timing one.

## Acceptance criteria

- [ ] A test reproduces the defect: a symbol pending at `initAlertEngine`, a second alert
      armed on it before history arrives, history replayed — the second alert must not
      fire
- [ ] The same test passes with the fix
- [ ] An alert that survived a reload still fires from its historical crossing
      (BUG-0441's behaviour is preserved, not traded away)
- [ ] If the fix needs a WASM change, `static/wasm` is rebuilt in the same PR

## Out of scope

- The first-timeframe-window and not-deferred residuals of BUG-0441's "Known limitation"
  — those are separate mechanisms with the same no-rollback constraint.

## Links

- [`BUG-0441`](BUG-0441-legacy-alert-cold-baseline-never-fires.md) — the replay this
  scoping defect sits in; its "Known limitation" third variant is this item
- `src/services/alertEngine/legacyReplayCoordinator.ts` — `configureLegacyReplay`,
  `replayBeforeLegacyEvaluation`, `setPendingLegacyReplaySymbols`
- `src/stores/alerts.svelte.ts` — `initAlertEngine`, where the pending snapshot is taken
- `src/stores/market/applyUpdate.ts` — the pre-evaluation replay call
- `technicals-wasm/src/alert_engine.rs` — `AlertEngine::evaluate`, engine-wide per symbol
