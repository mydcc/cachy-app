---
id: BUG-0491
title: A bot with frequency every_time places a second order on the same candle after a reload
type: bug
status: specced
priority: P0
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: ADR-0012
depends_on: []
---

# BUG-0491 — A bot places a second order on the same candle after a reload

## Symptom

A trader arms a bot (`consequence_level: "simulate"`, FEAT-0396) whose rule
carries `frequency: every_time`. The bot fires on a candle and places an entry
through `orderPlacementService.placeEntryGroup`. The trader reloads the tab —
or the tab is restored by the browser, or a crash-recovery reopens it — while
that same candle is still the newest one and its conditions still hold.

The bot fires **again on the same candle** and places a **second entry**. The
paper balance now carries two positions the strategy describes as one, and
every later `percent_of_equity` / `percent_risk` sizing is measured against a
balance that is wrong by one whole position.

The same shape reaches live money the moment FEAT-0035 builds the `send` path,
so this is not confined to the simulator.

## Evidence

**Derived, from reading the code.** Two mechanisms dedupe a firing, and only
one of them survives a reload.

1. `src/lib/rules/ruleEvaluationGate.ts:39` — the within-session dedupe is
   three in-memory `Map`s on a module-level singleton:

   ```typescript
   private readonly lastEvaluatedAnchorMs = new Map<string, number>();
   private readonly lastIntrabarAnchorMs = new Map<string, number>();
   private readonly lastIntrabarFiredAnchorMs = new Map<string, number>();
   ```

   Nothing writes them to storage. A reload constructs
   `export const ruleEvaluationGate = new RuleEvaluationGate()` afresh
   (`ruleEvaluationGate.ts:168`), so every rule reads as never-evaluated.

2. `src/services/alertEngine/ruleStateStore.ts:134` — the across-session record
   *is* persisted (`fired_count`, `last_fired_anchor_ms`), and the core applies
   `frequency` from it (FEAT-0440). That is what would stop the re-fire.

The two disagree exactly at `every_time`, and `ruleEvaluationGate.ts:122` says
so in its own words:

> `frequency` […] still governs across candles — but it cannot carry the
> within-candle half, because the core answers `every_time` with yes however
> often the rule has fired.

So for `frequency: every_time` the persistent record is inert by design and the
only thing preventing a second firing on one anchor is the map that the reload
just discarded.

The one-shot path does not cover it either: `notifyingRuleSink`
(`src/stores/alerts.svelte.ts`) calls `disarmRule(rule.id)` only behind
`if (!isSpentAfterFiring(rule)) return;` — an `every_time` rule is not spent, so
it stays `enabled: true` in `cachy_rules_v1` and is re-armed on the next start.

## Cause

Dedupe guarantees do not scale with `consequence_level`. `RuleEvaluationGate`
was built for FEAT-0387, where a duplicate verdict costs a duplicate
notification, and in-memory is a proportionate answer to that. FEAT-0396 routed
an *order* through the same gate without giving the gate a durable record, so a
`notify` rule and a `simulate` rule now get identical protection against a
consequence that differs by the price of a position.

## Fix

Give the anchor record the same durability as the consequence it guards.
Options, cheapest first:

1. Persist `lastEvaluatedAnchorMs` / `lastIntrabarFiredAnchorMs` for rules where
   `isBot(rule)` into the existing `ruleStateStore` (it already holds a
   per-rule, per-anchor record and already survives a reload), and read it back
   when the gate is constructed. Prefers one storage mechanism over two.
2. Refuse `frequency: every_time` on promotion in `RuleDocument::promote`, so a
   bot cannot carry the one frequency the persistent record cannot express.
   Narrower, but it removes a capability a trader may legitimately want.

Leave the `notify` path alone — in-memory dedupe is the right cost there, and
widening it would make every alert pay for a bot's guarantee.

Do **not** fix this by making every bot one-shot: that silently repurposes
`frequency` and is its own defect (see BUG-0492's neighbourhood).

## Acceptance criteria

- [ ] A test arms a bot with `frequency: every_time`, fires it on an anchor,
      rebuilds the gate (simulating a reload) with the rule still armed and the
      same anchor newest, and asserts **no second** `placeEntryGroup` call
- [ ] The test fails without the fix
- [ ] A `notify` rule with `frequency: every_time` still announces on a later
      candle, so the fix did not turn every_time into once
- [ ] The paper balance after the reload scenario shows exactly one position

## Links

- `docs/adr/0012-*` — decision 5, every automated order enters one gate
- `docs/backlog/features/FEAT-0396-*` — the item that routed orders here
- `docs/backlog/features/FEAT-0477-*` — the intrabar record this shares a home with
- BUG-0492 — the gate's invalidation API has no caller at all
