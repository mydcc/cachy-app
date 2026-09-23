---
id: BUG-0484
title: The rule store is read from localStorage and reparsed on every kline tick, not once per candle close
type: bug
status: done
assignee: opencode
branch: fix/bug-0484-rule-cache
shipped: unreleased
priority: P1
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: []
---

# BUG-0484 — The rule store is read from localStorage and reparsed on every kline tick, not once per candle close

## Symptom

With the alert engine armed, the chart stutters and input lag rises as more symbols are
watched. The cost scales with websocket traffic, not with the number of alerts: a trader
with a single armed alert pays it too.

## Evidence

**Derived**, and it contradicts the comment that justifies the design.

`src/services/alertEngine/ruleLoopWiring.ts` — `readStoredRules`:

> Read per candle close rather than cached: a close happens once per timeframe period per
> series, so this is a handful of reads a minute

It is not called once per close. `ruleEvaluationLoop.observeCandles` runs this
unconditionally, before the close check:

```ts
const anchorMs = this.advance(symbol, timeframe, candles);
const firings = this.evaluateForming(symbol, timeframe);   // <- every call
if (anchorMs === undefined) return firings;
```

and `evaluateForming` calls `rulesFor` → `this.readRules()` → `readStoredRules()` →
`localStorage.getItem` + `JSON.parse` of the whole rule set.

`observeCandles` is called from `marketState.applySymbolKlines`
(`src/stores/market.svelte.ts:349`), which runs on every websocket kline update and every
REST batch — not on closes. So every tick of every watched series performs a synchronous
`localStorage` read and a full `JSON.parse` on the main thread, in the store's write path,
ahead of the chart's paint.

A second cost rides the same path: `resolveThreshold` is called once per rule per
evaluation, and `drawingThresholdResolver` (`ruleLoopWiring.ts`) opens with
`drawingStore.load()` — for every rule, including the ones anchored to no drawing.

The exposure is `symbols × timeframes × tick rate`, against a project rule that forbids
heavy work on hot paths (`AGENTS.md` → Non-Negotiable Rules → Performance).

## Cause

`evaluateForming` was added for FEAT-0477 and has to run on every tick — that is what
intrabar means. It reaches the rule set through the same uncached reader the close path
uses, and the reader's "once per close" assumption was never revisited.

## Fix

Cache the parsed rule set and invalidate it from the paths that write `cachy_rules_v1`.
`alertState.rulesVersion` already exists for exactly this purpose — it is bumped by every
writer so a derived list re-reads — and is currently only consumed by the UI. The
docstring rejects a cache because it "would have to be invalidated from every place that
can edit a rule"; that place already exists and is already maintained.

Cheaper still, and worth doing either way: leave `evaluateForming` early when the rule set
holds no intrabar rule for this series, so a session with no intrabar rule — the
overwhelming majority — never reaches the reader on a non-close tick at all.

Also: hoist `drawingStore.load()` out of the per-rule resolver, or make the resolver
return early for a document that is not drawing-anchored before loading anything.

## Acceptance criteria

- [ ] A test feeds N non-close ticks and asserts the rule reader is invoked a bounded
      number of times, not N — failing before the fix
- [ ] Editing, arming, disarming or deleting a rule is visible to the next evaluation
      without a reload
- [ ] `drawingStore.load()` is not called for a rule that is not drawing-anchored
- [ ] Intrabar rules keep being evaluated on every tick, and the close path keeps seeing
      the rule set as of that close

## Links

- `src/services/alertEngine/ruleEvaluationLoop.ts` — `observeCandles`, `evaluateForming`, `rulesFor`
- `src/services/alertEngine/ruleLoopWiring.ts` — `readStoredRules`, `drawingThresholdResolver`
- `src/stores/market.svelte.ts:349` — the hot path this sits in
- `src/stores/alerts.svelte.ts` — `rulesVersion`, the invalidation signal that already exists
- [`FEAT-0368`](../features/FEAT-0368-alert-engine-evaluation-batching.md) — the debounce item this is adjacent to
