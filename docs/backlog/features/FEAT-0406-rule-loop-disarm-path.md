---
id: FEAT-0406
title: Give the rule evaluation loop a disarm path, coupled to coverage
type: feature
status: idea
priority: P3
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0012
depends_on: [FEAT-0387]
size: S
estimate: 2
---

# FEAT-0406 — Give the rule evaluation loop a disarm path, coupled to coverage

## Problem

The FEAT-0387 cutover decides two things separately, once each:

- **Coverage** — which alerts leave the legacy engine — is recomputed continuously,
  on every candle close and every 60s re-sync tick.
- **Arming** — whether the rule loop evaluates and notifies at all — is decided once
  at startup, in `initAlertEngine()`, and never revisited. `startRuleEvaluationLoop`
  returns `void`; there is no stop.

Nothing keeps the two in step, and one of the two inputs they share is
`ruleSchema.isReady()`. Coverage treats an unready core as "nothing is covered", which
is the safe answer *only* while a not-ready core also means a not-armed loop.

The gap is unreachable today, and it is worth writing down exactly why:
`RuleSchemaService.isReady()` returns `this.core !== null`, and `core` is assigned in
`load()` and never cleared, so `isReady()` only ever transitions `false → true`. The
cutover's no-double-fire property silently rests on that monotonicity. Nobody wrote
that down before this item.

If a future change makes the rule core reloadable — a reconnect, a hot-swap, a
version upgrade that nulls `core` before re-fetching — the invariant breaks and the
consequence is immediate:

1. `isReady()` flips to `false` mid-session.
2. The next re-sync tick computes empty coverage and pushes every alert back onto the
   legacy engine.
3. The rule loop, armed since startup, keeps evaluating and notifying for its rules.
4. Both engines now serve the same alert — the double fire the whole per-alert
   coverage design exists to make unconstructable.

Freezing coverage instead would be no better: it would leave alerts off the legacy
engine while a dead core evaluates nothing, which is the silent gap (BUG-0382) from the
other side. There is no correct one-sided response, which is why this needs the missing
half rather than a guard.

## Proposal

Give the loop a stop, and make arming a continuous decision rather than a startup one.

- `startRuleEvaluationLoop` returns a disposer, or `ruleEvaluationLoop` grows an
  explicit `disarm()` that clears its configuration.
- The re-sync closure in `initAlertEngine()` decides arming and coverage from the same
  `ruleSchema.isReady()` read, in the same tick: ready means armed and real coverage,
  not-ready means disarmed and empty coverage. Neither half moves without the other.
- `stopCoverageResync()` joins that teardown, so a disarmed session stops ticking too.

This is useful independently of the hypothetical: a loop that cannot be stopped is also
a loop tests must work around, and `alerts_engineWiring.test.ts` already mocks
`startRuleEvaluationLoop` partly for that reason.

## Acceptance criteria

- [ ] The rule evaluation loop can be disarmed, and a disarmed loop evaluates nothing
- [ ] Arming and coverage are computed from one `ruleSchema.isReady()` read per tick
- [ ] A test drives `isReady()` from `true` to `false` mid-session and asserts that no
      alert is served by both engines at any point
- [ ] A test asserts the mirror case: a disarmed loop hands every alert back to the
      legacy engine, so none is served by neither
- [ ] `stopCoverageResync()` runs as part of disarming

## Out of scope

Making the rule core actually reloadable. This item supplies the half that a reload
would need; it does not add one, and adding one without this is the hazard above.

## Open questions

- Should a disarm be visible to the trader, the way `engineStatus: "failed"` is? A
  session that silently drops back to the legacy engine is correct but slower, and the
  FEAT-0387 argument for surfacing `failed` may apply here too.

## Links

- `src/stores/alerts.svelte.ts` — `initAlertEngine()`, the arming decision and the
  60s coverage re-sync
- `src/lib/rules/ruleSchema.ts` — `isReady()`, the monotonicity this depends on
- `src/services/alertEngine/ruleCoverage.ts` — `readCoveredAlertIds()`
- `src/services/alertEngine/ruleEvaluationLoop.ts` — the loop that has no stop
- [FEAT-0387](FEAT-0387-expose-rule-evaluator.md) — the cutover this constrains
- ADR-0012
