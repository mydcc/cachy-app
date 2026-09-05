---
id: FEAT-0387
title: Expose the rule evaluator to JavaScript and evaluate on candle close
type: feature
status: in-progress
branch: worktree-expose-rule-evaluator-27b349
assignee: claude-code
start_date: 2026-09-05
priority: P1
milestone: M4
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0012
depends_on: [FEAT-0303]
size: M
estimate: 5
---

# FEAT-0387 — Expose the rule evaluator to JavaScript and evaluate on candle close

## Problem

`FEAT-0303` shipped the whole rule core: a `RuleDocument` can be parsed, validated,
hashed, authorised, and asked which timeframes it reads. `technicals-wasm/src/rule/evaluate.rs`
contains a complete evaluator with an `EvalContext` over candles, indicator values and
feeds.

None of it can run from the app. `technicals-wasm/src/rule/exports.rs` exports
`validate`, `content_hash`, `authorise`, `warmup_candles`, `timeframes` and
`from_alert` — and not `evaluate`. Verifiable in one line:

```bash
grep -c 'rule_evaluate' technicals-wasm/src/rule/exports.rs static/wasm/technicals_wasm.js
```

Both are `0`. So the rule core is a validated data structure with no runtime, the UI
still talks to the old `AlertEngineWasm`, and every richer alert feature is blocked
behind this one gap.

## Proposal

Export the evaluator and drive it from a candle-close loop.

**Rust.** Add `rule_evaluate` to `exports.rs` following the two-layer pattern already
established there: an internal `evaluate_json` returning `Result<_, Refused>`, plus a
three-line `#[wasm_bindgen]` shell that converts the refusal into a `JsValue`. The
input carries the document plus the `Ctx` payload; the output is a verdict
naming which conditions held.

**TypeScript.** Extend `ruleSchema` in `src/lib/rules/ruleSchema.ts` with `evaluate`,
reusing its existing `RuleRefusedError` / `RuleCoreUnavailableError` handling rather
than inventing a second error path.

**Wiring.** A rule is evaluated **once per close of its `trigger_timeframe`**, not per
price tick. Each condition reads the last candle of its own timeframe that had already
closed at that instant. A rule with fewer than `warmup_candles()` of trigger-timeframe
history produces no verdict at all.

This item does not change any UI. The old price-alert path keeps working untouched
until `FEAT-0388` migrates off it.

## Acceptance criteria

- [ ] `rule_evaluate` is reachable from TypeScript and round-trips a document plus an
      evaluation context
- [ ] A refusal from the evaluator arrives in TypeScript as `RuleRefusedError` with its
      `field` intact, not as an opaque string
- [ ] A rule is evaluated exactly once per close of its trigger timeframe — asserted
      with a test that feeds several ticks inside one candle and counts evaluations
- [ ] A condition on a coarser timeframe reads the last candle of that timeframe which
      had closed at the trigger instant, not a later one
- [ ] A rule with insufficient history returns no verdict rather than a verdict built
      from a partial buffer
- [ ] A `notify` document never yields an order intent, whatever the caller asks for
- [ ] Evaluation cost stays bounded with many rules armed on the same symbol

## Out of scope

- Any UI. The panel is `FEAT-0389`.
- Migrating stored alerts. That is `FEAT-0388`.
- New condition kinds. `Condition::Pattern` is `FEAT-0394`.

## Open questions

- **Where does the evaluation loop live?** The market store already owns candle
  updates, but `docs/adr/0009-candle-depth-and-background-store-isolation.md` forbids
  a background consumer writing into `marketState`. The loop must read without
  writing, or sit beside the store.
- **Orphaned migrated rules.** `FEAT-0388`'s migration keeps a rule's `enabled` flag
  in sync with its source alert's `active` flag on every run, but if the alert is
  deleted from `cachy_alerts_v1` entirely (`AlertDefinitionsModal.removeAlert`), the
  migrated rule is left behind, still enabled, in `cachy_rules_v1` — nothing in the
  migration can safely tell a now-orphaned migrated rule apart from one a future rule
  editor authored directly. Before this item starts evaluating rules for real, decide
  how to reconcile ids at cutover (e.g. disable or drop any rule whose id has no
  matching alert, if `cachy_rules_v1` still only ever holds migrated rules at that
  point).
- **Granularity behavior change from FEAT-0388.** Migrated alerts are pinned to `1m`
  Close evaluation (decision per ADR-0012 decision 3; see FEAT-0388 backlog "Behavior
  Change Documented for FEAT-0387"). At cutover, surface this to traders clearly:
  "Legacy alerts fired per-tick; migrated ones fire on candle close. You may see up
  to 1-minute delay, and mid-candle touch-recoveries will no longer fire." No
  implementation change needed here, just user communication.

## Links

- [`FEAT-0303`](FEAT-0303-strategy-rule-schema.md) — the schema and evaluator this exposes
- [`FEAT-0368`](FEAT-0368-alert-engine-evaluation-batching.md) — close-driven evaluation
  is the debounce that item asks for; reconcile the two rather than doing both
- [`ADR-0012`](../../adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md)
- [`docs/alert-system.md`](../../alert-system.md)
- `technicals-wasm/src/rule/evaluate.rs`, `technicals-wasm/src/rule/exports.rs`
- `src/lib/rules/ruleSchema.ts`
