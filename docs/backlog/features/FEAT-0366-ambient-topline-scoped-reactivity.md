---
id: FEAT-0366
title: Scope AmbientTopline reactivity to active symbols instead of reading whole marketState.data
type: feature
status: in-progress
assignee: antigravity
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
size: S
# Branch: feat/perf-optimizations-batch
---

# FEAT-0366 — Scope AmbientTopline reactivity to active symbols instead of reading whole marketState.data

## Problem

In `src/components/shared/AmbientTopline.svelte:62-74`, the market sentiment calculation depends on reading the entire dictionary:

```typescript
const items = Object.values(marketState.data);
if (!items.length) return null;
...
```

Because `marketState.data` is a reactive `$state` dictionary in Svelte 5, calling `Object.values(marketState.data)` inside a `$derived.by` registers a broad dependency on the entire map. As a result, every price, ticker, or kline tick for *any* symbol currently tracked across the app re-executes this derivation, recalculating averages and triggering domino updates for the topline bar on high-frequency WS streams.

## Proposal

1. Instead of reading all dynamic keys in `marketState.data`, compute sentiment against a specific, well-defined set of anchor symbols (e.g. `['BTCUSDT', 'ETHUSDT', 'SOLUSDT']` or the user's active favorite symbols).
2. Alternatively, throttle or debounce the sentiment recalculation so that it updates at a bounded cadence (e.g. at most once every 1000ms) rather than on every raw tick.
3. Access specific symbol properties directly: `marketState.data[sym]?.priceChangePercent` for monitored symbols only, preserving fine-grained reactivity.

## Evaluation

- **Umfang (Scope):** S (approx. 20 lines modified in `AmbientTopline.svelte`)
- **Priorität (Priority):** P2 (Reduces high-frequency CPU burn during volatile market conditions)
- **Schwierigkeit (Difficulty):** Medium
- **Dringlichkeit (Urgency):** Low

## Acceptance criteria

- [x] Price ticks on non-monitored symbols do not trigger recalculations in `AmbientTopline`.
- [x] Topline sentiment indicator continues to display accurate market bias.
- [x] Profiling shows reduced reactivity triggers under 50+ ticks/sec WebSocket load.

## Out of scope

- Redesigning the Ambient Topline visual UI.

## Open questions

None.

## Links

- `src/components/shared/AmbientTopline.svelte:62-74`
- `src/stores/market.svelte.ts`
