---
id: BUG-0485
title: The broken-alert record is built, never read and never cleared
type: bug
status: ready
priority: P2
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: []
---

# BUG-0485 — The broken-alert record is built, never read and never cleared

## Symptom

An alert that can never fire — its drawing was deleted, its indicator is not computable on
the alert path, the core refuses the document — produces one toast, once, at the moment
the engine first notices. Miss that toast (tab in the background, trader switched away,
`brokenAlertReport` set to anything but `notify`) and the alert sits in the panel looking
armed, forever, with nothing anywhere saying why it is silent.

The reverse is also wrong: once a rule has been recorded as inert, fixing it — redrawing
the line, re-arming with a computable indicator — does not clear the record. For the rest
of the session the system still holds "this rule can never fire" about a rule that now can.

## Evidence

**Derived.**

`src/services/alertEngine/ruleEvaluationLoop.ts` keeps a `Map<string, UnevaluableRule>`
and documents it as the durable half of the mechanism:

> A map rather than a set of ids already reported, because this is the durable half of the
> mechanism: a log line is a hope that somebody reads the console, whereas this **can be
> rendered by the alert panel**, asserted in a test, and counted.

`unevaluableRules()` is its only reader. It has no production caller — only tests. The
panel renders `alertState.orphanReport`, `drawingReport` and `legacyMigrationReport`, and
nothing renders this. So the only surface that reaches a trader is the one-shot toast in
`settingsAwareUnevaluableSink`, which `reportUnevaluable` deliberately limits to once per
rule:

```ts
private reportUnevaluable(rule: RuleDocument, reason: string): void {
  if (this.unevaluable.has(rule.id)) return;
```

The map is cleared only by `reset()`, whose production callers are none — it is documented
for "HMR teardown and tests". Nothing clears a single rule's entry when that rule is
edited, re-armed, deleted, or becomes evaluable again.

Net effect: the mechanism's stated design is sound and its wiring is missing at both ends.

## Cause

`unevaluableRules()` was built ahead of the panel surface that was meant to consume it, and
the surface never landed. Per-rule invalidation was never needed while nothing read the map.

## Fix

Two ends of the same wire:

- Render the record. The Manage tab is where a trader looks at armed rules, and a rule
  that cannot fire belongs next to the rule, not in a separate report. Reuse the wording
  the toast already has (`dashboard.alerts.brokenRule.*`).
- Clear a rule's entry when the rule changes. `armRule`, `removeRule` and `disarmRule`
  (`src/services/alertEngine/armRule.ts`) are the writers; a rule that produces a verdict
  again should drop out of the list on its own.

Leave alone: the unconditional log line, and the `brokenAlertReport` setting gating only
the interruption. Both are correct as they stand.

## Acceptance criteria

- [ ] A test asserts a rule reported unevaluable appears in a panel-visible list
- [ ] Editing or re-arming a rule clears its entry, and a rule that evaluates again is no
      longer listed — failing before the fix
- [ ] A deleted rule does not stay in the list
- [ ] The log line still fires unconditionally, and the toast still fires at most once per
      rule per session

## Links

- `src/services/alertEngine/ruleEvaluationLoop.ts` — `unevaluableRules`, `reportUnevaluable`, `reset`
- `src/services/alertEngine/ruleLoopWiring.ts` — `settingsAwareUnevaluableSink`
- `src/services/alertEngine/armRule.ts` — the three writers that should invalidate
- `src/components/alerts/tabs/ManageTab.svelte` — the proposed surface
- [`BUG-0382`](BUG-0382-alert-engine-never-initialised.md) — the silent-alert failure class this exists to prevent
