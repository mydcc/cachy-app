---
name: gortex-backlog-jcodemunch-src-syncservice-syncbitunixpositions
description: "Work in the backlog-jcodemunch/src · syncService.syncBitunixPositions area — 187 symbols across 18 files (69% cohesion)"
---

# backlog-jcodemunch/src · syncService.syncBitunixPositions

187 symbols | 18 files | 69% cohesion

## When to Use

Use this skill when working on files in:
- `.worktrees/backlog-jcodemunch/src/lib/actions.ts`
- `.worktrees/backlog-jcodemunch/src/lib/appAuth.ts`
- `.worktrees/backlog-jcodemunch/src/services/aiModelsService.ts`
- `.worktrees/backlog-jcodemunch/src/services/apiService_syntheticTimeframes.test.ts`
- `.worktrees/backlog-jcodemunch/src/services/app.ts`
- `.worktrees/backlog-jcodemunch/src/services/csvService_hardening.test.ts`
- `.worktrees/backlog-jcodemunch/src/services/exchange/bitgetAdapter.ts`
- `.worktrees/backlog-jcodemunch/src/services/exchange/bitunixAdapter.ts`
- `.worktrees/backlog-jcodemunch/src/services/frameSupportService.ts`
- `.worktrees/backlog-jcodemunch/src/services/imgbbService.ts`
- `.worktrees/backlog-jcodemunch/src/services/rssParserService.ts`
- `.worktrees/backlog-jcodemunch/src/services/syncService.ts`
- `.worktrees/backlog-jcodemunch/src/services/trackingService.ts`
- `.worktrees/backlog-jcodemunch/src/services/tradeService.ts`
- `.worktrees/backlog-jcodemunch/src/stores/market.svelte.ts`
- `.worktrees/backlog-jcodemunch/src/stores/market/types.ts`
- `.worktrees/backlog-jcodemunch/src/stores/ui.svelte.ts`
- `.worktrees/backlog-jcodemunch/src/utils/utils.ts`

## Key Files

| File | Symbols |
|------|---------|
| `.worktrees/backlog-jcodemunch/src/lib/actions.ts` | event, handleClick |
| `.worktrees/backlog-jcodemunch/src/lib/appAuth.ts` | isClientTokenError, appFetch, appAuthHeaders, body, token, ... |
| `.worktrees/backlog-jcodemunch/src/services/aiModelsService.ts` | e, entry, res, opts, hash, ... |
| `.worktrees/backlog-jcodemunch/src/services/apiService_syntheticTimeframes.test.ts` | json |
| `.worktrees/backlog-jcodemunch/src/services/app.ts` | activeSymbol, isAuto, symbol, app.fetchAllAnalysisData |
| `.worktrees/backlog-jcodemunch/src/services/csvService_hardening.test.ts` | get |
| `.worktrees/backlog-jcodemunch/src/services/exchange/bitgetAdapter.ts` | account.fetchLeverageMarginMode, account.fetchTradingPairInfo, symbol, symbol |
| `.worktrees/backlog-jcodemunch/src/services/exchange/bitunixAdapter.ts` | account.fetchLeverageMarginMode, symbol, symbol, account.fetchTradingPairInfo |
| `.worktrees/backlog-jcodemunch/src/services/frameSupportService.ts` | urlStr, res, checkDomainSupport, data, domain |
| `.worktrees/backlog-jcodemunch/src/services/imgbbService.ts` | settings, url, file, imgbbService.uploadToImgbb, error, ... |
| `.worktrees/backlog-jcodemunch/src/services/rssParserService.ts` | error, timeoutId, body, rssParserService.parseRssFeed, input, ... |
| `.worktrees/backlog-jcodemunch/src/services/syncService.ts` | syncService.syncBitunixPositions, e, message, settings, updatedJournal, ... |
| `.worktrees/backlog-jcodemunch/src/services/trackingService.ts` | eventData, category, trackCustomEvent, value, action, ... |
| `.worktrees/backlog-jcodemunch/src/services/tradeService.ts` | symbol, json, data, e, tiers, ... |
| `.worktrees/backlog-jcodemunch/src/stores/market.svelte.ts` | symbol, setSymbolMeta, symbol, setPositionTiers, info, ... |
| `.worktrees/backlog-jcodemunch/src/stores/market/types.ts` | PositionTier |
| `.worktrees/backlog-jcodemunch/src/stores/ui.svelte.ts` | progress, setSyncProgress |
| `.worktrees/backlog-jcodemunch/src/utils/utils.ts` | T, unwrapApiEnvelope, ApiEnvelope, body |

## Entry Points

- `.worktrees/backlog-jcodemunch/src/services/syncService.ts::syncService.syncBitunixPositions@175`

## Connected Communities

- **src/services +21 dirs** (24 cross-edges)
- **services +30 dirs** (10 cross-edges)
- **lib/calculators +24 dirs** (8 cross-edges)
- **src/stores +4 dirs · error** (6 cross-edges)
- **src/services +33 dirs** (6 cross-edges)
- **backlog-jcodemunch/src · safeDecimal** (4 cross-edges)
- **src/services +11 dirs** (4 cross-edges)
- **src/services +26 dirs** (3 cross-edges)
- **lib/server +38 dirs** (2 cross-edges)
- **src/services · fetchBatchedKlines** (2 cross-edges)
- **tests/benchmarks +12 dirs** (2 cross-edges)
- **src/services · app.fetchAtr** (2 cross-edges)
- **utils/server +13 dirs** (1 cross-edges)
- **src/utils +14 dirs** (1 cross-edges)
- **src/stores +4 dirs · ResultsManager** (1 cross-edges)
- **src/services · getKlines** (1 cross-edges)
- **src/services +2 dirs** (1 cross-edges)
- **lib/windows +10 dirs** (1 cross-edges)
- **backlog-jcodemunch/src · show** (1 cross-edges)
- **services +5 dirs** (1 cross-edges)
- **stores +1 dirs · RiskManager** (1 cross-edges)
- **services +8 dirs** (1 cross-edges)
- **backlog-jcodemunch/src · map** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-197")
explore(operation:"context", task:"understand backlog-jcodemunch/src · syncService.syncBitunixPositions", format:"gcx")
relations(operation:"usages", target:{symbol:".worktrees/backlog-jcodemunch/src/services/syncService.ts::syncService.syncBitunixPositions@175"}, format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
