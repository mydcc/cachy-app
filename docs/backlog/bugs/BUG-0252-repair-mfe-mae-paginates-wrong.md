---
id: BUG-0252
title: repairMfeMae calculates wrong values for long trades due to missing pagination
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: persistence
data_class: A
adr: none
depends_on: []
---

# BUG-0252: repairMfeMae calculates wrong values for long trades due to missing pagination

## Context

In `src/services/dataRepairService.ts`, the `repairMfeMae` function recalculates the Maximum Favorable Excursion (MFE) and Maximum Adverse Excursion (MAE) for journal entries by fetching historical klines.

## Evidence (Derived)

Derived, from reading the code in `src/services/dataRepairService.ts`, lines 457-480.

When the service fetches klines for a trade chunk, it calls `fetchSmartKlines` with a fixed limit of 1000:
```typescript
        const result = await fetchSmartKlines(
          chunk.symbol,
          interval,
          1000,
          chunk.startTs,
          chunk.endTs,
          chunk.provider
        );
```

While `dataRepairService` attempts to group multiple short trades into a single chunk spanning up to `MAX_SPAN_MS` (900 candles), it does not account for a single trade whose duration exceeds 1000 candles (e.g. a swing trade held for 4 days on a 5-minute interval).

If a trade spans more than 1000 candles, the exchange API returns a truncated response (usually the first 1000 candles). The code then computes MFE and MAE solely on this truncated subset of the trade's lifespan. The calculated MFE/MAE are mathematically incorrect for the total duration of the trade and are persisted into the `journalState`, irreversibly polluting Class A trading data.

## Expected Behavior

`dataRepairService.ts` must paginate `fetchSmartKlines` requests if a chunk spans more than the API's candle limit, or explicitly fail the repair for that trade. It should not compute and persist MFE/MAE over an incomplete subset of the trade's duration.

## Suggested Test Case

1. Mock `fetchSmartKlines` to return 1000 klines for a requested timespan of 2000 candles.
2. Provide a journal entry whose `entryDate` and `exitDate` encompass the 2000 candle timespan.
3. Call `repairMfeMae`.
4. Assert that the repair correctly paginates to fetch the remaining 1000 candles, OR assert that the repair safely fails and skips updating the entry rather than persisting corrupted MFE/MAE values.
