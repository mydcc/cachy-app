---
id: FEAT-0387
title: Expose the rule evaluator to JavaScript and evaluate on candle close
type: feature
status: in-progress
branch: worktree-alert-rule-evaluator-cutover-52ddf9
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

- [x] `rule_evaluate` is reachable from TypeScript and round-trips a document plus an
      evaluation context
- [x] A refusal from the evaluator arrives in TypeScript as `RuleRefusedError` with its
      `field` intact, not as an opaque string
- [x] A rule is evaluated exactly once per close of its trigger timeframe — asserted
      with a test that feeds several ticks inside one candle and counts evaluations
- [x] A condition on a coarser timeframe reads the last candle of that timeframe which
      had closed at the trigger instant, not a later one
- [x] A rule with insufficient history returns no verdict rather than a verdict built
      from a partial buffer
- [x] A `notify` document never yields an order intent, whatever the caller asks for
- [ ] Evaluation cost stays bounded with many rules armed on the same symbol —
      **not measured.** Evaluation is per candle close rather than per tick, which is
      the reduction `FEAT-0368` asks for, but no benchmark backs the claim yet.

## Cutover

Every alert is evaluated by exactly one engine. Coverage is derived per alert from
`cachy_rule_origin_v1` plus the current rule store (`ruleCoverage.ts`), never from a
global switch: an alert leaves the legacy engine only when a specific, armed rule is
proven to hold it, and any doubt — an unmigrated alert, a deleted or disabled rule, an
unreadable store, a core that has not loaded, a series nothing subscribes to — leaves it
on the legacy path. That is what makes a double fire unconstructable and a silent gap
impossible; see "Second review round" below for the two ways that promise was not yet
true and how it was made true.

Coverage is handed back the moment the trader edits or deletes an alert: until the next
start re-syncs it, the rule still holds the pre-edit threshold (`BUG-0402`), so it is
disarmed and the legacy engine takes the alert again.

Rolling back is one argument: `initAlertEngine(loadModule, "shadow")`. `mode` reaches
both the coverage decision and the sink together — real coverage only happens in
`"live"` mode, so shadow mode removes nothing from the legacy engine while the loop
still evaluates and records, purely as an addition.

The behaviour change is surfaced in the alert list (`cutoverNotice.ts`,
`AlertDefinitionsModal`): a dismissible notice, shown only to a trader who actually has
a covered alert, naming both consequences — up to a minute of delay, and no firing for
a mid-candle touch that recovers.

## Proving the evaluator actually runs

Every other test around the loop substitutes something — `ruleSchema`'s tests use a
`fakeCore` with hardcoded verdicts, the gate runs on that same fake, the loop's tests
mock the gate away. Correct individually, and together they left the one thing that
matters unproven: that TypeScript, the wasm evaluator and real candles agree at all. A
disagreement over timeframe spelling, context JSON or warmup count would make the loop
run, produce nothing, log nothing, and take every covered alert quiet with it —
`BUG-0382` with a new cause, invisible to mocked tests because the mock is the part that
would disagree.

`ruleEvaluation.integration.test.ts` closes that: real loop, real gate, real
`ruleSchema`, real wasm (the artefact is committed, so it runs on a bare checkout), and
documents built by the same `rule_from_alert_json` the migration uses.

`npm run shadow:run` measures the behaviour change on demand — both wasm engines over
the same candles, the legacy one per tick and the rule one per close, reporting matched
firings with their delay, legacy-only firings (the intra-candle touch that recovers) and
rule-only firings, which the cutover does not predict and which fail the run.

## The live run, and what it found

Done. And it found something the integration test and the offline script both
missed, because both load `ruleSchema`'s wasm core themselves as part of their own
setup: **production never did.** `alertEngine.ensureLoaded()` loads the legacy
engine's wasm; nothing loaded the rule evaluator's own core. Every real evaluation
threw `RuleCoreUnavailableError` inside the gate, caught and logged by the loop's
"never throws" guarantee — silently, since the `alerts` log category is off by
default. Every migrated rule was armed, covered, and permanently inert. `BUG-0382`
again, through a second subsystem that loads independently of the one `BUG-0382` was
about.

Fixed: `initAlertEngine()` now awaits `ruleSchema.load()` before coverage is
computed, and `readCoveredAlertIds()` reports nothing while the core is not ready —
a rule the store shows as armed does not count as covered for an evaluator that
cannot run it, so the alert stays on the legacy path rather than falling between
both. The loop only arms once the core is confirmed ready.

Re-verified live against the running app on real `BTCUSDT` candles after the fix:
`ruleSchema.isReady()` true, a real close evaluated without throwing, the gate's own
dedup state showed the market-store-driven path had already evaluated the same
anchor automatically (proving the automatic wiring ran, not a manual poke), and a
throwaway loop instance fed the real historical candles spanning a genuine cross
wrote a `"fires"` verdict to the shadow ledger end to end.

A secondary bug surfaced in the same session: `compareShadowLedger()` only counted
`source: "shadow"` records, but the live cutover records `source: "rule"` —
comparing a live session's ledger would have reported the rule engine as having
never fired at all. Also fixed.

## Second review round

Two more High findings, both from the same root the first round's fixes did not yet
cover: coverage was granted without proof the rule path can produce a verdict *when it
matters* — core-loaded, series-observed, sink-notifying are all three preconditions, and
only the first was checked.

**The shadow-mode rollback was not safe.** `syncEngine()` stripped covered alerts from
the legacy engine regardless of which sink armed the loop. `ledgerSink` records and never
notifies, so the documented rollback actually left a covered alert served by *neither*
engine — the ironic case: the author's own live shadow run only produced a meaningful
comparison because the load bug happened to make coverage empty at the time. Fixed by
making the mode argument reach both decisions together (see Cutover, above) — coverage is
real only in `"live"` mode.

**Coverage was granted without checking the series is actually observed.** Migrated
rules are pinned to `1m`, but the app only subscribes to whatever the chart or active
indicators use — often not `1m`. A covered rule whose series never arrives is armed,
core-ready, and permanently silent on both paths. Fixed: `readCoveredAlertIds()` now
takes an `isSeriesObserved` predicate (`ruleLoopWiring.isSeriesObserved`) and defaults to
"nothing observed" — omitting it is the safe state, not a silent gap. Verified live: with
no `1m` subscription, coverage correctly reports empty and the cutover notice stays
hidden; with a genuinely observed series (`5m`, in the verification), coverage and the
notice both behave as before.

## Third review round

**Medium — coverage was a startup snapshot, the loop is session-long.** A migrated
rule whose series was not observed at `initAlertEngine()` time stayed on the legacy
engine from the initial sync. If that series became observed later in the same
session (a different chart opened, an indicator subscribed), the rule loop — already
armed since startup — started evaluating and notifying for it while the legacy engine
still held the same alert: both engines serving one alert, the "double fire is
unconstructable" claim holding only at the instant coverage was computed, not for the
session it was believed to cover.

Fixed with `RuleEvaluationLoop`'s new `onClose(symbol, timeframe, anchorMs)` hook,
called once per genuine close, before that close is evaluated. `initAlertEngine`
wires it, live mode only, to re-run `readCoveredAlertIds` and `syncEngine` — so a
newly-covered alert is off the legacy engine before the rule engine could notify for
the same event. Shadow mode never wires the hook, for the same reason it forces
coverage empty at startup.

**Minor — the "report" half of suspend-and-report had no consumer.** `orphanReport`
was assigned and never read. Now surfaced as a banner in the alert list: `suspended`
counts (naturally stop appearing once nothing new needs suspending) and `withheld`
counts (shown for as long as an alarm stays armed despite unresolved doubt — that one
cannot be a one-time acknowledgement, because the doubt does not resolve itself).

## Out of scope

- Any UI. The panel is `FEAT-0389`.
- Migrating stored alerts. That is `FEAT-0388`.
- New condition kinds. `Condition::Pattern` is `FEAT-0394`.

## Open questions

- **Where does the evaluation loop live?** The market store already owns candle
  updates, but `docs/adr/0009-candle-depth-and-background-store-isolation.md` forbids
  a background consumer writing into `marketState`. The loop must read without
  writing, or sit beside the store.
- ~~**Orphaned migrated rules.**~~ **Decided** — *suspend and report*: an orphan is
  disabled and kept, never deleted and never left silently armed. Two facts closed
  this question. First, `FEAT-0401`'s `cachy_rule_origin_v1` ledger tells a migrated
  rule apart from a hand-authored one, which this item's text still assumed was
  impossible. Second, the per-rule test alone is unsafe: a missing source alert means
  "the trader deleted it" *or* "the alert store is gone" (fresh device, cleared site
  data, a `cachy_rules_v1` backup restored without its counterpart), and only the
  shape of the whole set separates them. `reconcileOrphanedRules.ts` therefore gates
  suspension twice — the store must have been *present* (an absent key is not an
  empty one), and no more than half of the migrated, armed rules may be orphaned
  (`ORPHAN_RATIO_MIN_SAMPLE` guards small sets, where the ratio says nothing). Both
  gates fail towards leaving rules armed: a fired alarm the trader thought they
  removed is noise; a silently disarmed one is a trader standing uncovered. Withheld
  candidates are reported, not dropped.
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
