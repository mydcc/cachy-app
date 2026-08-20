---
name: gortex-technicals-wasm-src-1-dirs-clone
description: "Work in the technicals-wasm/src +1 dirs · Clone area — 339 symbols across 9 files (99% cohesion)"
---

# technicals-wasm/src +1 dirs · Clone

339 symbols | 9 files | 99% cohesion

## When to Use

Use this skill when working on files in:
- `.worktrees/backlog-jcodemunch/technicals-wasm/src/alert_engine.rs`
- `.worktrees/backlog-jcodemunch/technicals-wasm/src/alert_engine_tests.rs`
- `.worktrees/backlog-jcodemunch/technicals-wasm/src/alert_exports.rs`
- `.worktrees/backlog-jcodemunch/technicals-wasm/src/indicator_settings.rs`
- `.worktrees/backlog-jcodemunch/technicals-wasm/src/lib.rs`
- `technicals-wasm/src/alert_engine.rs`
- `technicals-wasm/src/alert_exports.rs`
- `technicals-wasm/src/indicator_settings.rs`
- `technicals-wasm/src/lib.rs`

## Key Files

| File | Symbols |
|------|---------|
| `.worktrees/backlog-jcodemunch/technicals-wasm/src/alert_engine.rs` | symbol, new, PriceCrossUp, symbol, id, ... |
| `.worktrees/backlog-jcodemunch/technicals-wasm/src/alert_engine_tests.rs` | test_alert_engine_cross_down, test_alert_engine_cross_up, test_alert_engine_oscillate |
| `.worktrees/backlog-jcodemunch/technicals-wasm/src/alert_exports.rs` | engine, evaluate, id, new, alert_json, ... |
| `.worktrees/backlog-jcodemunch/technicals-wasm/src/indicator_settings.rs` | RocSettings, atr_length, DonchianSettings, VwmaSettings, ObvSettings, ... |
| `.worktrees/backlog-jcodemunch/technicals-wasm/src/lib.rs` | HmaSettings, length, bb, sar, ChopSettings, ... |
| `technicals-wasm/src/alert_engine.rs` | set_alerts, alert_id, AlertDefinition, timestamp, active, ... |
| `technicals-wasm/src/alert_exports.rs` | alerts_json, set_alerts |
| `technicals-wasm/src/indicator_settings.rs` | d, k, Default, length, length, ... |
| `technicals-wasm/src/lib.rs` | r1, s3, start, length, max_af, ... |

## Entry Points

- `.worktrees/backlog-jcodemunch/technicals-wasm/src/alert_engine_tests.rs::test_alert_engine_cross_up`
- `.worktrees/backlog-jcodemunch/technicals-wasm/src/alert_engine_tests.rs::test_alert_engine_oscillate`
- `.worktrees/backlog-jcodemunch/technicals-wasm/src/alert_engine_tests.rs::test_alert_engine_cross_down`

## How to Explore

```
analyze(operation:"communities", id:"community-378")
explore(operation:"context", task:"understand technicals-wasm/src +1 dirs · Clone", format:"gcx")
relations(operation:"usages", target:{symbol:".worktrees/backlog-jcodemunch/technicals-wasm/src/alert_engine_tests.rs::test_alert_engine_cross_up"}, format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
