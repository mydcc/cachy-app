---
name: gortex-rule-1-dirs-initialize
description: "Work in the rule +1 dirs · initialize area — 221 symbols across 3 files (96% cohesion)"
---

# rule +1 dirs · initialize

221 symbols | 3 files | 96% cohesion

## When to Use

Use this skill when working on files in:
- `technicals-wasm/src/lib.rs`
- `technicals-wasm/src/rule/consequence.rs`
- `technicals-wasm/src/rule/refusal.rs`

## Key Files

| File | Symbols |
|------|---------|
| `technicals-wasm/src/lib.rs` | initialized, value_of, TechnicalsCalculator, test_supertrend_multiplier, VolMaState, ... |
| `technicals-wasm/src/rule/consequence.rs` | requested, authorise, as_str |
| `technicals-wasm/src/rule/refusal.rs` | every_code_keeps_its_historical_wire_spelling |

## Entry Points

- `technicals-wasm/src/lib.rs::test_streaming_update_shift_equals_batch`
- `technicals-wasm/src/lib.rs::test_mfi_matches_window_reference`
- `technicals-wasm/src/lib.rs::test_vwap_session_resets_on_utc_day_change`
- `technicals-wasm/src/lib.rs::test_hma_is_the_full_wma_chain`
- `technicals-wasm/src/lib.rs::test_pivots_use_previous_candle_classic`

## Connected Communities

- **rule · new** (3 cross-edges)
- **rule +1 dirs · parse** (2 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-810")
explore(operation:"context", task:"understand rule +1 dirs · initialize", format:"gcx")
relations(operation:"usages", target:{symbol:"technicals-wasm/src/lib.rs::test_streaming_update_shift_equals_batch"}, format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
