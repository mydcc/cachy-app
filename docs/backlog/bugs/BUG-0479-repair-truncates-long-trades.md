---
id: BUG-0479
title: MFE/MAE repair truncates klines for long trades, silently corrupting journal metrics
type: bug
status: in-progress
assignee: opencode
branch: fix/bug-0479-repair-truncation
priority: P0
milestone: none
editions: [community, pro, private]
area: persistence
data_class: A
adr: none
depends_on: []
---
## Overview
The `dataRepairService` attempts to calculate missing Maximum Favorable Excursion (MFE) and Maximum Adverse Excursion (MAE) by fetching historical market data via `fetchSmartKlines`. However, the fetch is strictly bounded to a hardcoded `limit: 1000` candles, regardless of the trade's actual duration.
If a trade was open for an extended period (e.g., 4 days using a 5-minute timeframe), it spans 1152 candles. `fetchSmartKlines` fetches only the first or last 1000 candles. The logic then computes the highs and lows from this incomplete set and saves it back into `journalState.updateEntry`. This permanently stamps the journal entry with an incorrect MFE/MAE value, giving the user a false impression of their historical trade performance.
Because the system only attempts to repair entries where `mfe === undefined` or `mae === undefined`, this silent truncation is irreversible via the UI once calculated.
## Evidence
**Derived, from reading the code.**
In `src/services/dataRepairService.ts`, line 457:
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
Then later on line 467, it iterates the trades and calculates the MFE/MAE without validating that the returned `result.klines` actually fully covers `trade.exitDate - trade.entryDate`.
The exact same problem exists for ATR repair on line 260 where it also uses `limit: 1000` indiscriminately.
## Acceptance Criteria
- [x] A trade spanning more candles than the exchange's single-request limit correctly calculates MFE/MAE by either batch-fetching the required history or explicitly aborting/warning rather than writing truncated data.
- [x] MFE/MAE and ATR repair operations verify that the fetched `tradeKlines` fully spans the required `startTs` to `endTs` before assigning values to `journalState.updateEntry`.
- [x] A unit test proves that a mock API returning partial coverage due to limits results in a failed or correctly aggregated calculation, rather than silently persisting the partial calculation.
## Out of Scope
- Implementing an advanced chunking logic if too complex; explicitly failing the repair for trades longer than 1000 candles is a valid MVP to prevent data corruption.
- General optimizations to `journalState.updateEntry` batching logic.
