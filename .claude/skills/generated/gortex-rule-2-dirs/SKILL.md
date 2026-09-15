---
name: gortex-rule-2-dirs
description: "Work in the rule +2 dirs area — 284 symbols across 9 files (88% cohesion)"
---

# rule +2 dirs

284 symbols | 9 files | 88% cohesion

## When to Use

Use this skill when working on files in:
- `src/lib/chart/indicatorLayer.ts`
- `src/services/chartPatterns.types.ts`
- `src/services/storageService.test.ts`
- `technicals-wasm/src/rule/condition.rs`
- `technicals-wasm/src/rule/evaluate.rs`
- `technicals-wasm/src/rule/indicator.rs`
- `technicals-wasm/src/rule/lifecycle.rs`
- `technicals-wasm/src/rule/pattern.rs`
- `technicals-wasm/src/rule/timeframe.rs`

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/chart/indicatorLayer.ts` | ManagedSeries |
| `src/services/chartPatterns.types.ts` | ChartPatternDefinition, ChartPatternRef |
| `src/services/storageService.test.ts` | StoredRecord |
| `technicals-wasm/src/rule/condition.rs` | op, Compare, None, side, is_last, ... |
| `technicals-wasm/src/rule/evaluate.rs` | timeframe, closed_candles_from, Expired, back, open, ... |
| `technicals-wasm/src/rule/indicator.rs` | an_indicator_with_a_price_choice_accepts_every_price_field |
| `technicals-wasm/src/rule/lifecycle.rs` | anchor_close_ms, after_firing_returns_a_new_state_and_leaves_the_old_one_alone, after_firing |
| `technicals-wasm/src/rule/pattern.rs` | an_unknown_pattern_name_is_refused_by_name, needs_trend_context, ShootingStar, ThreeWhiteSoldiers, HangingMan, ... |
| `technicals-wasm/src/rule/timeframe.rs` | milliseconds |

## Entry Points

- `technicals-wasm/src/rule/evaluate.rs::insertion_order_into_the_market_does_not_affect_the_verdict`
- `technicals-wasm/src/rule/evaluate.rs::a_mark_price_rule_reads_the_mark_series_and_not_the_last_one`
- `technicals-wasm/src/rule/evaluate.rs::an_indicator_over_another_price_is_its_own_series`
- `technicals-wasm/src/rule/evaluate.rs::a_strict_comparison_against_an_inclusive_window_never_fires`

## Connected Communities

- **rule · detect** (6 cross-edges)
- **rule +1 dirs · may_announce** (3 cross-edges)
- **rule · indicator** (3 cross-edges)
- **rule · new** (2 cross-edges)
- **rule +1 dirs · parse** (2 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-813")
explore(operation:"context", task:"understand rule +2 dirs", format:"gcx")
relations(operation:"usages", target:{symbol:"technicals-wasm/src/rule/evaluate.rs::insertion_order_into_the_market_does_not_affect_the_verdict"}, format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
