---
id: BUG-0558
title: Cached market quotes are presented as live and can seed the calculator
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: market-data
data_class: C
adr: none
depends_on: []
---

# BUG-0558 — Cached market quotes are presented as live and can seed the calculator

## Symptom

A per-symbol market channel can stop updating while the tile or dashboard continues to show its cached price as live. Selecting that row silently copies an old price into the calculator for sizing, stop distance, R:R, and order preparation.

## Evidence

**Derived.** `src/components/shared/MarketOverview.svelte:102-109` accepts stored `lastPrice` without timestamp/age, and `:323-338` copies it into calculator entry state. `src/components/shared/MarketDashboardModal.svelte:234-245` prefers cached data or an analysis snapshot without age disclosure, while `:287-308` derives a green Live state from whether analysis is running rather than quote freshness.

## Cause

Public quote state carries no consistent per-symbol freshness/source contract between market display and calculator seeding.

## Fix

Apply the age/source semantics used for position mark prices to market-derived displays and calculator seeding. Mark stale values, show their source and age, and require an explicit confirmation or refusal before loading a stale quote into the calculator.

## Acceptance criteria

- [ ] Every tile and dashboard quote has or can derive a timestamp and source.
- [ ] Values beyond a named maximum age are marked stale or unpriced.
- [ ] Green Live status cannot coexist with stale row data without a per-row disclosure.
- [ ] Stale values cannot silently become calculator entry prices.
- [ ] Tests cover WebSocket, REST fallback, and analysis-snapshot sources.

## Out of scope

- Position PnL stale-price handling already covered by BUG-0218 and BUG-0512.
- Changing exchange WebSocket protocols.
- Public-market-data storage architecture.

## Links

- `src/components/shared/MarketOverview.svelte:102-109`
- `src/components/shared/MarketOverview.svelte:323-338`
- `src/components/shared/MarketDashboardModal.svelte:234-245`
- `src/components/shared/MarketDashboardModal.svelte:287-308`
- Existing coverage: BUG-0218, BUG-0512; those cover position mark price, not market tile freshness.
