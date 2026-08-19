---
name: gortex-src-services-11-dirs
description: "Work in the src/services +11 dirs area — 192 symbols across 29 files (58% cohesion)"
---

# src/services +11 dirs

192 symbols | 29 files | 58% cohesion

## When to Use

Use this skill when working on files in:
- ``
- `.worktrees/backlog-jcodemunch/src/app.d.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/orders/orders_place_order_ordertype.test.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/sync/orders/+server.ts`
- `.worktrees/backlog-jcodemunch/src/services/apiQuotaTracker.svelte.ts`
- `.worktrees/backlog-jcodemunch/src/services/autoBackupService.svelte.ts`
- `.worktrees/backlog-jcodemunch/src/services/backupService.test.ts`
- `.worktrees/backlog-jcodemunch/src/services/bitunixWs.ts`
- `.worktrees/backlog-jcodemunch/src/services/exchange/unsupportedVerbs.test.ts`
- `.worktrees/backlog-jcodemunch/src/services/tradeService_hedgeClose.test.ts`
- `.worktrees/backlog-jcodemunch/src/services/tradeService_requestFields.test.ts`
- `.worktrees/backlog-jcodemunch/src/stores/ai.svelte.ts`
- `.worktrees/backlog-jcodemunch/src/stores/alerts.svelte.ts`
- `.worktrees/backlog-jcodemunch/src/stores/notes.svelte.ts`
- `.worktrees/backlog-jcodemunch/src/stores/quiz.svelte.ts`
- `.worktrees/backlog-jcodemunch/src/stores/ui.svelte.ts`
- `src/routes/api/orders/orders_place_order_ordertype.test.ts`
- `src/routes/api/sync/orders/+server.ts`
- `src/services/apiQuotaTracker.svelte.ts`
- `src/services/autoBackupService.svelte.ts`
- `src/services/backupService.test.ts`
- `src/services/bitunixWs.ts`
- `src/services/exchange/unsupportedVerbs.test.ts`
- `src/services/tradeService_hedgeClose.test.ts`
- `src/services/tradeService_requestFields.test.ts`
- `src/stores/ai.svelte.ts`
- `src/stores/alerts.svelte.ts`
- `src/stores/quiz.svelte.ts`
- `src/stores/ui.svelte.ts`

## Key Files

| File | Symbols |
|------|---------|
| `` | isArray, parse |
| `.worktrees/backlog-jcodemunch/src/app.d.ts` | FileSystemFileHandle, Window |
| `.worktrees/backlog-jcodemunch/src/routes/api/orders/orders_place_order_ordertype.test.ts` | options, sentBody |
| `.worktrees/backlog-jcodemunch/src/routes/api/sync/orders/+server.ts` | resultData, text, nonce, endTime, jsonError, ... |
| `.worktrees/backlog-jcodemunch/src/services/apiQuotaTracker.svelte.ts` | raw, load, e, constructor |
| `.worktrees/backlog-jcodemunch/src/services/autoBackupService.svelte.ts` | hasOpfsData, isLocalEmpty, presetCount, file, checkOpfsSnapshotOnStartup, ... |
| `.worktrees/backlog-jcodemunch/src/services/backupService.test.ts` | getItem, key |
| `.worktrees/backlog-jcodemunch/src/services/bitunixWs.ts` | d, p, obj, v, v, ... |
| `.worktrees/backlog-jcodemunch/src/services/exchange/unsupportedVerbs.test.ts` | value, isEmpty |
| `.worktrees/backlog-jcodemunch/src/services/tradeService_hedgeClose.test.ts` | calls, call, lastBody |
| `.worktrees/backlog-jcodemunch/src/services/tradeService_requestFields.test.ts` | call, lastBody |
| `.worktrees/backlog-jcodemunch/src/stores/ai.svelte.ts` | singleRegex, match, regex, singleMatch, actions, ... |
| `.worktrees/backlog-jcodemunch/src/stores/alerts.svelte.ts` | data, parsed, e, constructor, loadFromStorage |
| `.worktrees/backlog-jcodemunch/src/stores/notes.svelte.ts` | load, e, parsed, constructor, oldChat, ... |
| `.worktrees/backlog-jcodemunch/src/stores/quiz.svelte.ts` | loadProgress, stored, importState, parsed, e, ... |
| `.worktrees/backlog-jcodemunch/src/stores/ui.svelte.ts` | constructor |
| `src/routes/api/orders/orders_place_order_ordertype.test.ts` | sentBody, options |
| `src/routes/api/sync/orders/+server.ts` | text, fetchBitunixData, limit, timestamp, path, ... |
| `src/services/apiQuotaTracker.svelte.ts` | load, e, raw, constructor |
| `src/services/autoBackupService.svelte.ts` | isLocalEmpty, rawPresets, parsed, presetCount, opfsMeta, ... |
| `src/services/backupService.test.ts` | key, getItem |
| `src/services/bitunixWs.ts` | obj, v, p, d, isTradeData, ... |
| `src/services/exchange/unsupportedVerbs.test.ts` | isEmpty, value |
| `src/services/tradeService_hedgeClose.test.ts` | lastBody, call, calls |
| `src/services/tradeService_requestFields.test.ts` | call, lastBody |
| `src/stores/ai.svelte.ts` | parseActions, actions, text, singleRegex, parsed, ... |
| `src/stores/alerts.svelte.ts` | parsed, data, e, constructor, loadFromStorage |
| `src/stores/quiz.svelte.ts` | parsed, storedCat, json, stored, importState, ... |
| `src/stores/ui.svelte.ts` | constructor |

## Connected Communities

- **lib/calculators +24 dirs** (4 cross-edges)
- **src/utils +14 dirs** (4 cross-edges)
- **src/services +21 dirs** (3 cross-edges)
- **utils/server +13 dirs** (3 cross-edges)
- **src/stores +4 dirs · error** (3 cross-edges)
- **src/services · saveOpfsSnapshot** (2 cross-edges)
- **src/services +33 dirs** (2 cross-edges)
- **src/services +26 dirs** (2 cross-edges)
- **utils/server +16 dirs** (2 cross-edges)
- **services · saveOpfsSnapshot** (2 cross-edges)
- **services +2 dirs · warn** (2 cross-edges)
- **stores +1 dirs · QuizStore** (1 cross-edges)
- **services +4 dirs · error** (1 cross-edges)
- **src/stores · QuizStore** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-395")
explore(operation:"context", task:"understand src/services +11 dirs", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
