---
id: BUG-0482
title: A mark-price operand inside a window is never supplied with mark candles and the rule never fires
type: bug
status: done
assignee: opencode
branch: fix/bug-0482-mark-window-parity
shipped: unreleased
priority: P1
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: []
---

# BUG-0482 — A mark-price operand inside a window is never supplied with mark candles and the rule never fires

## Symptom

An alert on "mark price breaks above its 20-candle mark-price high" is armed, looks
armed in the panel, and never fires — not once, not late, never. The same alert written
against the last price works.

On a perpetual the mark price is the number a liquidation is measured against, so this is
the case where a trader most wants to be told, and it is the case that is silently dead.

## Evidence

**Derived.** The TypeScript mirror and the Rust core disagree, and the TS side's own
comment says they must not:

`src/services/alertEngine/ruleEvaluationLoop.ts` — `collectMarkTimeframes`:

```ts
const readsMark = (operand: unknown): boolean =>
  operand !== null &&
  typeof operand === "object" &&
  (operand as { source?: unknown }).source === "mark";
```

It tests `source` on `node.left` and `node.right` directly. A `window` operand
(`src/lib/rules/types.ts`) is shaped

```ts
{ kind: "window"; of: Operand; agg: WindowAgg; lookback: number }
```

— it carries no `source` of its own; the `source` sits on `of`. So `readsMark` answers
false, `collectMarkTimeframes` returns an empty set, `markCandlesFor` returns `undefined`,
and the evaluation context reaches the core with no `mark_candles` key.

The core then does exactly what it promises: `docs/alert-system.md` and
`src/lib/rules/types.ts` both state that a rule naming the mark price without a mark
series evaluates to `indeterminate` rather than falling back to the last price. Correct,
and permanent — the condition can never be answered.

The Rust side handles this: `technicals-wasm/src/rule/condition.rs:798` notes that
`Condition::mark_timeframes` "has to delegate: … asks the operands", and
`technicals-wasm/src/rule/exports.rs:344` exports `rule_mark_timeframes` for exactly this
question. The TS mirror's docstring says "The local mirror of `RuleDocument::mark_timeframes`
in the core … The two must agree". They do not, and nothing tests that they do:
`crossPathParity.test.ts` compares indicator values, not mark timeframes.

`percent_change` is unaffected — it carries `source` at its own level.

## Cause

`collectMarkTimeframes` walks the condition tree but not the operand tree, and `window`
is the one operand that nests another operand.

## Fix

Make `readsMark` recurse into `window.of`, and add the parity test the docstring already
claims: for a corpus of documents, `collectMarkTimeframes` must return the same set as
the core's `rule_mark_timeframes` export.

The parity test is the part that matters. The recursion fixes today's shape; the test is
what stops the next nested operand re-opening this.

## Acceptance criteria

- [ ] A test arms a rule whose right-hand side is `window{ of: price(mark) }` and asserts
      the evaluation context carries `mark_candles` — failing before the fix
- [ ] A parity test asserts `collectMarkTimeframes` equals the core's
      `rule_mark_timeframes` over every condition and operand shape in `types.ts`
- [ ] A rule with no mark operand still reaches the core with no `mark_candles` key, so
      its wire payload and content hash are unchanged

## Links

- `src/services/alertEngine/ruleEvaluationLoop.ts` — `collectMarkTimeframes`, `markCandlesFor`
- `src/lib/rules/types.ts` — the `window` operand, `PriceSource`
- `technicals-wasm/src/rule/condition.rs:621` — the core's delegating implementation
- `technicals-wasm/src/rule/exports.rs:344` — `rule_mark_timeframes`
- [`FEAT-0390`](../features/FEAT-0390-price-alert-conditions.md) — where mark price entered the schema
