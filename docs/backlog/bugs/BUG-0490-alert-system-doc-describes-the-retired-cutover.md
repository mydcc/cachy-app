---
id: BUG-0490
title: The alert system document still describes the two-engine cutover that FEAT-0399 removed
type: bug
status: ready
priority: P3
milestone: none
editions: [community, pro, private]
area: docs
data_class: none
adr: none
depends_on: []
---

# BUG-0490 — The alert system document still describes the two-engine cutover that FEAT-0399 removed

## Symptom

`docs/alert-system.md` is the entry point for anyone — human or agent — touching alerts. Its
"Evaluation" section describes a system that no longer exists, in the present tense:

> Status: both paths run, and which one serves an alert is decided per alert. … An alert
> nothing covers … stays on the legacy per-tick path (`alertEngine.evaluate` on every price
> tick). Coverage is recomputed on every close and once a minute besides … The legacy store
> `cachy_alerts_v1` is removed by `FEAT-0399`, not before.

FEAT-0399 merged as `05ebac57` ("retire the legacy alert engine and its store"). There is one
engine. There is no coverage computation, no per-minute re-sync, no `alertsForLegacyEngine`.
`src/stores/alerts.svelte.ts` says so in its own comments throughout.

A reader who trusts the document will look for a second engine that is not there, and will
reason about failure modes ("it falls back to the legacy path") that cannot happen.

## Evidence

**Demonstrated** by reading the two side by side at `ea167a02`:

- `docs/alert-system.md` — the "Evaluation" status block and the "Cutover note for alerts
  armed before this system" section
- `src/stores/alerts.svelte.ts` — "FEAT-0399 removed the other half of this function",
  "With one engine left, coverage has nothing to decide"
- `src/services/alertEngine/ruleLoopWiring.ts` — the disarm log still reads "every alert is
  back on the legacy engine", which is now false in the same way

Second, smaller drift in the same file: the surfaces table lists Automation `send` as
"Planned — FEAT-0035", which is accurate, but the document does not say what an armed
`send` rule does today. See [`BUG-0487`](BUG-0487-send-level-rule-drops-its-order-intent-silently.md).

## Cause

The known pattern: a backlog item flipping to `done` does not pull `docs/<system>.md` after
it. The doc was written while the cutover was live and nothing required the merging PR to
revisit it.

## Fix

Rewrite the "Evaluation" section against the code as it is: one evaluator, close-driven by
default, `intrabar` as the opt-out, warmup and the finer-timeframe refusal unchanged.

Keep the "Cutover note for alerts armed before this system" — the behaviour change it
describes is still true for every migrated alert, and a trader reading why their old alert
fires a candle later still needs it. Say that the migration is now the only reader of
`cachy_alerts_v1`, which is what `initAlertEngine` actually does.

Fix the disarm log line in `ruleLoopWiring.ts` in the same pass: it names a destination that
no longer exists, and a log line that lies costs more than one that is terse.

Leave alone: "One document, three surfaces", "The data", "Where a trader arms a rule" and
"When a rule fires" — checked against the code and still accurate.

## Acceptance criteria

- [ ] No sentence in `docs/alert-system.md` asserts a second engine, coverage, or
      `alertsForLegacyEngine`
- [ ] The document states what `cachy_alerts_v1` is still read for, and by what
- [ ] The disarm log in `ruleLoopWiring.ts` names what actually happens
- [ ] The surfaces table's shipped/planned column matches the code

## Links

- `docs/alert-system.md`
- [`FEAT-0399`](../features/FEAT-0399-remove-legacy-alerts-v1.md) — the item that made this stale
- `src/stores/alerts.svelte.ts` — `initAlertEngine`
- `src/services/alertEngine/ruleLoopWiring.ts` — the disarm log line
