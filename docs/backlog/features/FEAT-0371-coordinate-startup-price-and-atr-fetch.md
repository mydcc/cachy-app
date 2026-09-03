---
id: FEAT-0371
title: Coordinate initial price and ATR fetches at startup to avoid duplicate calculations
type: feature
status: done
shipped: 1.6.0-beta.209
assignee: antigravity
branch: feat/perf-optimizations-batch
priority: P3
milestone: none
editions: [community, pro, private]
area: calculation
data_class: none
adr: none
depends_on: []
size: XS
---

# FEAT-0371 — Coordinate initial price and ATR fetches at startup to avoid duplicate calculations

## Problem

In `src/services/app.ts:120-121`:

```typescript
this.handleFetchPrice();
this.fetchAtr(true);
```

Both methods run asynchronously on app startup. Each method independently completes by triggering `this.calculateAndDisplay()`. When the application initializes, two separate full calculation passes are triggered within milliseconds of each other before the user has even interacted with the interface.

## Proposal

1. In the initial startup flow, combine the initial price and ATR fetches into a coordinated `Promise.all([this.fetchPriceAsync(), this.fetchAtrAsync(true)])`.
2. Trigger `this.calculateAndDisplay()` exactly once after both values have resolved.

## Evaluation

- **Umfang (Scope):** XS (approx. 15 lines modified in `app.ts`)
- **Priorität (Priority):** P3 (Startup cleanliness and minor CPU saving)
- **Schwierigkeit (Difficulty):** Low
- **Dringlichkeit (Urgency):** Low

## Acceptance criteria

- [x] Startup sequence triggers `calculateAndDisplay()` once instead of twice.
- [x] Initial price and ATR values are both correctly populated on first paint.
- [x] Fallback behavior remains resilient if ATR fetch fails or is disabled in settings.

## Out of scope

- Modifying how ATR or price is continuously updated via WebSocket streams.

## Open questions

None.

## Links

- `src/services/app.ts:120-121`
- `src/services/calculatorService.ts`
