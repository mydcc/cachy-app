---
id: FEAT-0809
title: Add exit conditions and a take-profit distance to the strategy document
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: required
depends_on: [FEAT-0806]
parent: FEAT-0805
size: L
estimate: 8
---

# FEAT-0809 — Add exit conditions and a take-profit distance to the strategy document

## Problem

`RuleDocument` can say when to enter (`conditions`) and when not to enter
(`veto`), but not when to leave. A bot therefore has exactly one automated exit:
the fixed stop attached at entry. It cannot take profit, trail, exit on a thesis
change, or exit on a time stop. A second bot cannot close the first one's
position either — `reduce_only` is refused by the submission path.

The user's example is concrete: buy when RSI < 30 and ADX > 20, sell when RSI >
70 or MACD's histogram crosses below zero. The entry half is expressible today;
the exit half has no field to live in.

## Proposal

Extend the rule document (schema v3) with two fields:

```ts
interface RuleDocument {
  // … existing fields
  /** Evaluated while this bot owns a position. Same Condition language. */
  exits?: ExitRule[];
  /** Resolved against the entry like `stop`, never stored as a price. */
  take_profit?: StopDistance;
}

interface ExitRule {
  when: Condition;
  close: "all" | "partial";
  /** Required for partial closes; 0 < fraction <= 1. */
  fraction?: DecimalString;
}
```

Rules:

- `exits` and `take_profit` are **hashed**: they change what the strategy means.
  Documents without them keep their existing content hash (the core omits
  absent/default fields, as it does for `stop`).
- `external_feed` is refused inside `exits` with its own refusal code, for the
  same reason it is refused in `conditions` (ADR-0012 decision 7). It stays
  legal in `veto`.
- `exits` are allowed only at `consequence_level: "simulate"` or above. A
  `notify` document that carries exits is refused: there is no position to
  close.
- An exit tree is subject to the same `MAX_CONDITION_DEPTH` as the trigger.
- An empty `exits` array is refused; absence means "no exits beyond the stop".
- `take_profit` mirrors `StopDistance` (`basis: "percent_of_entry"`, distance)
  so it cannot go stale between arming and filling. The alternative — a price
  written at authoring time — is rejected for the same reason ADR-0020 rejected
  a stored stop price.

The content-hash tests for pre-field documents are the guard that this does not
rewrite history.

## Acceptance criteria

- [ ] A document with `exits` round-trips through the wasm validator and the
      TypeScript types; a document without it validates and keeps its old hash,
      pinned by the existing pre-field hash tests.
- [ ] `exits` and `take_profit` change the content hash; editing only `name`,
      `enabled`, `frequency`, `valid_until_ms` or `note` still does not.
- [ ] `external_feed` inside an exit is refused with a refusal naming the field,
      and the same feed remains legal inside `veto`.
- [ ] A `notify` document with `exits` is refused, naming
      `exits`.
- [ ] `close: "partial"` without a fraction, with `fraction <= 0` or `> 1` is
      refused; `close: "all"` with a fraction is refused.
- [ ] A tree deeper than `MAX_CONDITION_DEPTH` is refused at the exit site.
- [ ] Every refusal has an i18n key and a test that asserts the field path.
- [ ] No UI is added in this item; the editor is FEAT-0811.

## Out of scope

- Executing the exits (FEAT-0810).
- The editor (FEAT-0811).
- Trailing stops as a separate field; a trailing rule can be expressed as an
  exit condition once the operand exists (FEAT-0815), and a dedicated
  `trailing` field is a later decision.
- Time-based exits beyond what `valid_until_ms` already means for triggers.

## Open questions

- Whether take profit is the distance field above, an exit condition on
  `unrealised_pnl_percent`, or both. Proposal: the distance field, because it
  matches the stop and needs no new operand. Tracked in
  [`TODO.md`](../../TODO.md#32-take-profit-and-exit-semantics).
- Whether a paused bot's exits keep evaluating. Proposal: yes; pause stops
  entries, exits keep protecting.

## Links

- [`ADR-0026`](../../adr/0026-a-bot-owns-the-position-it-opens.md)
- [`ADR-0012`](../../adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md)
- [`FEAT-0806`](FEAT-0806-attribute-paper-trades-and-journal-entries-to-their-bot.md)
- [`FEAT-0810`](FEAT-0810-execute-bot-exits-through-the-order-gate.md)
- Core: `technicals-wasm/src/rule/{document,condition,consequence}.rs`
- Types: `src/lib/rules/types.ts`
