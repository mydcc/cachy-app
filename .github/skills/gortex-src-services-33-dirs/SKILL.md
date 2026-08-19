---
name: gortex-src-services-33-dirs
description: "Work in the src/services +33 dirs area — 442 symbols across 89 files (69% cohesion)"
---

# src/services +33 dirs

442 symbols | 89 files | 69% cohesion

## When to Use

Use this skill when working on files in:
- ``
- `.worktrees/backlog-jcodemunch/src/lib/windows/WindowManager.svelte.ts`
- `.worktrees/backlog-jcodemunch/src/lib/windows/implementations/DialogView.svelte`
- `.worktrees/backlog-jcodemunch/src/lib/windows/implementations/DialogWindow.svelte.ts`
- `.worktrees/backlog-jcodemunch/src/lib/windows/implementations/SymbolPickerView.svelte`
- `.worktrees/backlog-jcodemunch/src/lib/windows/implementations/SymbolPickerWindow.svelte.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/funding-rate/funding-rate.test.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/klines/klines.test.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/orders/orders_cancel_path.test.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/orders/orders_history_queryCanceled.test.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/orders/orders_history_reduceOnly.test.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/orders/orders_history_time_range.test.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/orders/orders_leverage_marginmode.test.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/orders/orders_native_bulk.test.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/orders/orders_place_order_hedge.test.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/orders/orders_place_order_ordertype.test.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/positions/positions_positionId.test.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/sentiment/sentiment.test.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/stream-logs/+server.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/sync/positions-history/positions_history_security.test.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/tpsl/tpsl_paths.test.ts`
- `.worktrees/backlog-jcodemunch/src/services/alertEngine/alertEngine.ts`
- `.worktrees/backlog-jcodemunch/src/services/apiService.ts`
- `.worktrees/backlog-jcodemunch/src/services/apiService_fundingRate.test.ts`
- `.worktrees/backlog-jcodemunch/src/services/apiService_infinity.test.ts`
- `.worktrees/backlog-jcodemunch/src/services/apiService_rateLimit.test.ts`
- `.worktrees/backlog-jcodemunch/src/services/apiService_syntheticTimeframes.test.ts`
- `.worktrees/backlog-jcodemunch/src/services/app.test.ts`
- `.worktrees/backlog-jcodemunch/src/services/exchange/bitgetAdapter.ts`
- `.worktrees/backlog-jcodemunch/src/services/marketWatcher/syntheticHistory.test.ts`
- `.worktrees/backlog-jcodemunch/src/services/newsService_limit.test.ts`
- `.worktrees/backlog-jcodemunch/src/services/newsService_sentiment.test.ts`
- `.worktrees/backlog-jcodemunch/src/services/paperTrading_seam.test.ts`
- `.worktrees/backlog-jcodemunch/src/services/serializationService.ts`
- `.worktrees/backlog-jcodemunch/src/services/technicalsTypes.test.ts`
- `.worktrees/backlog-jcodemunch/src/services/tradeService_flashClose.test.ts`
- `.worktrees/backlog-jcodemunch/src/services/tradeService_hardening.test.ts`
- `.worktrees/backlog-jcodemunch/src/services/tradeService_hedgeClose.test.ts`
- `.worktrees/backlog-jcodemunch/src/services/tradeService_race.test.ts`
- `.worktrees/backlog-jcodemunch/src/services/tradeService_requestFields.test.ts`
- `.worktrees/backlog-jcodemunch/src/services/tradeService_serialization.test.ts`
- `.worktrees/backlog-jcodemunch/src/stores/ai.svelte.ts`
- `.worktrees/backlog-jcodemunch/src/tests/flash-close.test.ts`
- `.worktrees/backlog-jcodemunch/src/tests/tradeService_race.test.ts`
- `.worktrees/backlog-jcodemunch/tests/unit/verify_tpsl_validation.test.ts`
- `src/lib/windows/WindowManager.svelte.ts`
- `src/lib/windows/implementations/DialogView.svelte`
- `src/lib/windows/implementations/DialogWindow.svelte.ts`
- `src/lib/windows/implementations/SymbolPickerView.svelte`
- `src/lib/windows/implementations/SymbolPickerWindow.svelte.ts`
- `src/routes/api/funding-rate/funding-rate.test.ts`
- `src/routes/api/klines/klines.test.ts`
- `src/routes/api/orders/orders_cancel_path.test.ts`
- `src/routes/api/orders/orders_history_queryCanceled.test.ts`
- `src/routes/api/orders/orders_history_reduceOnly.test.ts`
- `src/routes/api/orders/orders_leverage_marginmode.test.ts`
- `src/routes/api/orders/orders_native_bulk.test.ts`
- `src/routes/api/orders/orders_place_order_hedge.test.ts`
- `src/routes/api/orders/orders_place_order_ordertype.test.ts`
- `src/routes/api/positions/positions_positionId.test.ts`
- `src/routes/api/sentiment/sentiment.test.ts`
- `src/routes/api/stream-logs/+server.ts`
- `src/routes/api/sync/positions-history/positions_history_security.test.ts`
- `src/routes/api/tpsl/tpsl_paths.test.ts`
- `src/services/apiService_fundingRate.test.ts`
- `src/services/apiService_infinity.test.ts`
- `src/services/apiService_rateLimit.test.ts`
- `src/services/app.test.ts`
- `src/services/exchange/bitgetAdapter.ts`
- `src/services/marketWatcher/syntheticHistory.test.ts`
- `src/services/newsService_limit.test.ts`
- `src/services/newsService_sentiment.test.ts`
- `src/services/paperTrading_seam.test.ts`
- `src/services/serializationService.ts`
- `src/services/tradeService_flashClose.test.ts`
- `src/services/tradeService_hardening.test.ts`
- `src/services/tradeService_hedgeClose.test.ts`
- `src/services/tradeService_race.test.ts`
- `src/services/tradeService_requestFields.test.ts`
- `src/services/tradeService_serialization.test.ts`
- `src/stores/ai.svelte.ts`
- `src/stores/journal.svelte.ts`
- `src/stores/market.svelte.ts`
- `src/stores/notes.svelte.ts`
- `src/stores/tpsl.svelte.ts`
- `src/stores/ui.svelte.ts`
- `src/tests/flash-close.test.ts`
- `src/tests/tradeService_race.test.ts`
- `tests/unit/verify_tpsl_validation.test.ts`

## Key Files

| File | Symbols |
|------|---------|
| `` | race, findIndex, resolve, stringify |
| `.worktrees/backlog-jcodemunch/src/lib/windows/WindowManager.svelte.ts` | id, getMinimizedIndex |
| `.worktrees/backlog-jcodemunch/src/lib/windows/implementations/DialogView.svelte` | Props |
| `.worktrees/backlog-jcodemunch/src/lib/windows/implementations/DialogWindow.svelte.ts` | destroy, DialogWindow, type, defaultValue, value, ... |
| `.worktrees/backlog-jcodemunch/src/lib/windows/implementations/SymbolPickerView.svelte` | Props |
| `.worktrees/backlog-jcodemunch/src/lib/windows/implementations/SymbolPickerWindow.svelte.ts` | resolve, SymbolPickerWindow, component, destroy, value, ... |
| `.worktrees/backlog-jcodemunch/src/routes/api/funding-rate/funding-rate.test.ts` | mockFetch.text, mockFetch.text |
| `.worktrees/backlog-jcodemunch/src/routes/api/klines/klines.test.ts` | text, text, text |
| `.worktrees/backlog-jcodemunch/src/routes/api/orders/orders_cancel_path.test.ts` | text, text |
| `.worktrees/backlog-jcodemunch/src/routes/api/orders/orders_history_queryCanceled.test.ts` | text, text |
| `.worktrees/backlog-jcodemunch/src/routes/api/orders/orders_history_reduceOnly.test.ts` | text, text, text |
| `.worktrees/backlog-jcodemunch/src/routes/api/orders/orders_history_time_range.test.ts` | text, text, text, text, text |
| `.worktrees/backlog-jcodemunch/src/routes/api/orders/orders_leverage_marginmode.test.ts` | text, text, text |
| `.worktrees/backlog-jcodemunch/src/routes/api/orders/orders_native_bulk.test.ts` | text, text, text, text, text, ... |
| `.worktrees/backlog-jcodemunch/src/routes/api/orders/orders_place_order_hedge.test.ts` | text, text |
| `.worktrees/backlog-jcodemunch/src/routes/api/orders/orders_place_order_ordertype.test.ts` | text, text |
| `.worktrees/backlog-jcodemunch/src/routes/api/positions/positions_positionId.test.ts` | text |
| `.worktrees/backlog-jcodemunch/src/routes/api/sentiment/sentiment.test.ts` | response.text |
| `.worktrees/backlog-jcodemunch/src/routes/api/stream-logs/+server.ts` | controller, stream.start, cleanup, initMsg, stream.cancel |
| `.worktrees/backlog-jcodemunch/src/routes/api/sync/positions-history/positions_history_security.test.ts` | text |
| `.worktrees/backlog-jcodemunch/src/routes/api/tpsl/tpsl_paths.test.ts` | text |
| `.worktrees/backlog-jcodemunch/src/services/alertEngine/alertEngine.ts` | addAlert, alert, e |
| `.worktrees/backlog-jcodemunch/src/services/apiService.ts` | FundingRateHistoryItem |
| `.worktrees/backlog-jcodemunch/src/services/apiService_fundingRate.test.ts` | text, text, text, text, text |
| `.worktrees/backlog-jcodemunch/src/services/apiService_infinity.test.ts` | text |
| `.worktrees/backlog-jcodemunch/src/services/apiService_rateLimit.test.ts` | fetchMock.json, fetchMock.json, fetchMock.text, fetchMock.text |
| `.worktrees/backlog-jcodemunch/src/services/apiService_syntheticTimeframes.test.ts` | body, text, jsonResponse, text |
| `.worktrees/backlog-jcodemunch/src/services/app.test.ts` | json, json, json |
| `.worktrees/backlog-jcodemunch/src/services/exchange/bitgetAdapter.ts` | account.fetchFundingRateHistory |
| `.worktrees/backlog-jcodemunch/src/services/marketWatcher/syntheticHistory.test.ts` | text, text, body, jsonResponse, installFakeExchange |
| `.worktrees/backlog-jcodemunch/src/services/newsService_limit.test.ts` | mockResponse.text, mockResponse.text |
| `.worktrees/backlog-jcodemunch/src/services/newsService_sentiment.test.ts` | text, text |
| `.worktrees/backlog-jcodemunch/src/services/paperTrading_seam.test.ts` | text |
| `.worktrees/backlog-jcodemunch/src/services/serializationService.ts` | end, data, content, e, serializationService.stringifyAsync, ... |
| `.worktrees/backlog-jcodemunch/src/services/technicalsTypes.test.ts` | read, relPath |
| `.worktrees/backlog-jcodemunch/src/services/tradeService_flashClose.test.ts` | text, text, text |
| `.worktrees/backlog-jcodemunch/src/services/tradeService_hardening.test.ts` | text, text, text |
| `.worktrees/backlog-jcodemunch/src/services/tradeService_hedgeClose.test.ts` | fetchSpy.text |
| `.worktrees/backlog-jcodemunch/src/services/tradeService_race.test.ts` | text |
| `.worktrees/backlog-jcodemunch/src/services/tradeService_requestFields.test.ts` | fetchSpy.text |
| `.worktrees/backlog-jcodemunch/src/services/tradeService_serialization.test.ts` | fetchSpy.text |
| `.worktrees/backlog-jcodemunch/src/stores/ai.svelte.ts` | res, line, e, baseUrl, payloadMessages, ... |
| `.worktrees/backlog-jcodemunch/src/tests/flash-close.test.ts` | text, text |
| `.worktrees/backlog-jcodemunch/src/tests/tradeService_race.test.ts` | text |
| `.worktrees/backlog-jcodemunch/tests/unit/verify_tpsl_validation.test.ts` | request.text, request.text, request.text, request.text, text, ... |
| `src/lib/windows/WindowManager.svelte.ts` | getMinimizedIndex, id |
| `src/lib/windows/implementations/DialogView.svelte` | Props |
| `src/lib/windows/implementations/DialogWindow.svelte.ts` | value, type, defaultValue, resolve, destroy, ... |
| `src/lib/windows/implementations/SymbolPickerView.svelte` | Props |
| `src/lib/windows/implementations/SymbolPickerWindow.svelte.ts` | component, constructor, resolve, destroy, value, ... |
| `src/routes/api/funding-rate/funding-rate.test.ts` | mockFetch.text, mockFetch.text |
| `src/routes/api/klines/klines.test.ts` | text, text, text |
| `src/routes/api/orders/orders_cancel_path.test.ts` | text, text |
| `src/routes/api/orders/orders_history_queryCanceled.test.ts` | text, text |
| `src/routes/api/orders/orders_history_reduceOnly.test.ts` | text, text, text |
| `src/routes/api/orders/orders_leverage_marginmode.test.ts` | text, text, text |
| `src/routes/api/orders/orders_native_bulk.test.ts` | text, text, text, text, text, ... |
| `src/routes/api/orders/orders_place_order_hedge.test.ts` | text, text |
| `src/routes/api/orders/orders_place_order_ordertype.test.ts` | text, text |
| `src/routes/api/positions/positions_positionId.test.ts` | text |
| `src/routes/api/sentiment/sentiment.test.ts` | response.text |
| `src/routes/api/stream-logs/+server.ts` | stream.cancel, initMsg, controller, stream.start, cleanup |
| `src/routes/api/sync/positions-history/positions_history_security.test.ts` | text |
| `src/routes/api/tpsl/tpsl_paths.test.ts` | text |
| `src/services/apiService_fundingRate.test.ts` | text, text, text, text, text |
| `src/services/apiService_infinity.test.ts` | text |
| `src/services/apiService_rateLimit.test.ts` | fetchMock.json, fetchMock.text, fetchMock.text, fetchMock.json |
| `src/services/app.test.ts` | json, json, json |
| `src/services/exchange/bitgetAdapter.ts` | account.fetchFundingRateHistory |
| `src/services/marketWatcher/syntheticHistory.test.ts` | installFakeExchange, text, body, text, jsonResponse |
| `src/services/newsService_limit.test.ts` | mockResponse.text, mockResponse.text |
| `src/services/newsService_sentiment.test.ts` | text, text |
| `src/services/paperTrading_seam.test.ts` | text |
| `src/services/serializationService.ts` | T, chunkSize, i, e, end, ... |
| `src/services/tradeService_flashClose.test.ts` | text, text, text |
| `src/services/tradeService_hardening.test.ts` | text, text, text |
| `src/services/tradeService_hedgeClose.test.ts` | fetchSpy.text |
| `src/services/tradeService_race.test.ts` | text |
| `src/services/tradeService_requestFields.test.ts` | fetchSpy.text |
| `src/services/tradeService_serialization.test.ts` | fetchSpy.text |
| `src/stores/ai.svelte.ts` | done, context, data, contextSummary, rejectAction, ... |
| `src/stores/journal.svelte.ts` | constructor, save, updateEntry, data, index, ... |
| `src/stores/market.svelte.ts` | symbol, applyUpdate, partial, flushUpdates |
| `src/stores/notes.svelte.ts` | addNote, messages, e, stored, save, ... |
| `src/stores/tpsl.svelte.ts` | error |
| `src/stores/ui.svelte.ts` | showError, message, type, showToast, message |
| `src/tests/flash-close.test.ts` | text, text |
| `src/tests/tradeService_race.test.ts` | text |
| `tests/unit/verify_tpsl_validation.test.ts` | request.text, request.text, request.text, text, text, ... |

## Connected Communities

- **src/services +26 dirs** (17 cross-edges)
- **src/services +11 dirs** (15 cross-edges)
- **services +8 dirs** (9 cross-edges)
- **lib/windows +10 dirs** (6 cross-edges)
- **src/utils +14 dirs** (6 cross-edges)
- **lib/calculators +24 dirs** (6 cross-edges)
- **src/utils +5 dirs** (4 cross-edges)
- **services +30 dirs** (3 cross-edges)
- **tests/benchmarks +12 dirs** (3 cross-edges)
- **src/stores +4 dirs · error** (2 cross-edges)
- **services +1 dirs · delete** (2 cross-edges)
- **src/stores · AiManager** (2 cross-edges)
- **stores · clear** (2 cross-edges)
- **services · get** (2 cross-edges)
- **services +4 dirs · error** (2 cross-edges)
- **lib/actions +10 dirs · addEventListener** (2 cross-edges)
- **lib/server +38 dirs** (1 cross-edges)
- **services +4 dirs · syncService.syncBitunixPositions** (1 cross-edges)
- **stores +2 dirs** (1 cross-edges)
- **stores/market +1 dirs · applySymbolKlines** (1 cross-edges)
- **backlog-jcodemunch/src · buildSystemPromptParts** (1 cross-edges)
- **backlog-jcodemunch/src · map** (1 cross-edges)
- **stores · JournalManager** (1 cross-edges)
- **stores · updateElement** (1 cross-edges)
- **backlog-jcodemunch/src · syncService.syncBitunixPositions** (1 cross-edges)
- **calculators +2 dirs** (1 cross-edges)
- **src/stores · updateElement** (1 cross-edges)
- **src/services +21 dirs** (1 cross-edges)
- **. +3 dirs · syncProjectKanbanStatus** (1 cross-edges)
- **ai/prompts** (1 cross-edges)
- **services +3 dirs · set** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-405")
explore(operation:"context", task:"understand src/services +33 dirs", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
