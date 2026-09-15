---
id: FEAT-0391
title: A template library for alert rules
type: feature
status: done
assignee: claude
branch: feat/feat-0391-alert-template-library
priority: P3
milestone: M4
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0012
depends_on: [FEAT-0028, FEAT-0030, FEAT-0389]
size: M
estimate: 5
---

# FEAT-0391 — A template library for alert rules

## Problem

A condition builder powerful enough to be useful is powerful enough to face a new user
with an empty form and no idea what to put in it. The gap between "I want to catch a
trend reversal" and a valid multi-condition rule is where most people stop.

## Proposal

A Templates tab: named strategies, each a complete `RuleDocument`, grouped by category
(Classic · Trend · Reversal · Range · Breakout · Risk). Each card shows the name, a
one-line description, and the indicators it uses. Picking one loads it into the Combo
tab **for editing** — it is a starting point, not a black box.

Starting set, one per category shape:

- MACD golden cross while RSI is oversold
- MACD death cross while RSI is overbought
- 50/200 golden cross confirmed by volume
- Vegas tunnel trend continuation
- TEMA cross above VWAP

Templates are **data**, not code: each is a `RuleDocument` that goes through the same
`validate()` as a hand-built rule, and the same content hash. That hash is the useful
part — it makes visible whether a trader is running a template unchanged or a variant
of it, which is what makes the register in `FEAT-0304` able to say anything.

Every template ships at `consequence_level: notify` and
`provenance.source: human`. A template that arrives armed to trade is not a template.

## Acceptance criteria

- [x] Every shipped template passes `validate()` — asserted by a test that iterates the
      whole library, so a broken template cannot ship: `templateLibrary.test.ts`,
      "passes validate()", one case per template against the committed WASM core
- [x] Loading a template fills the Combo builder and the rule can be edited before arming
      — `alertPanelState.loadTemplate` writes the draft and switches to Combo;
      `templateLibrary.test.ts` round-trips every template through `readComboForm` /
      `buildComboCondition` unchanged, so the tab opens unlocked and its mount-time
      write-through does not rewrite the template; `TemplatesTab.component.test.ts`
      pins the click
- [x] An unedited template and a second trader's unedited copy of it have the same
      content hash — same test file, with different ids, timestamps and localised names;
      editing one threshold changes the hash
- [x] No shipped template has a `consequence_level` above `notify` — the template type
      has no `action` field at all; `templateDocument` writes `notify` and `human` over
      whatever draft it replaces, asserted against a `send` draft with an order and a veto
- [x] Categories filter the list — `templatesIn` and the chip row, tested in both files
- [x] German and English names and descriptions for every template — every runtime key
      (names, descriptions, categories, the indicator names a card shows) resolves in
      both locales, and the `dashboard.alerts.templates` subtree has the same keys

## Decisions (2026-09-15)

- **TEMA cross above VWAP was not shipped.** Neither `tema` nor `vwap` is in the rule
  core's indicator registry, so that template could never pass `validate()`. Two
  templates the registry and the alert path can compute take its place: *ADX trend
  breakout* (ADX 14 crosses above 25 while +DI is above −DI) and *RSI bounce inside a
  range* (RSI 14 crosses back above 30 while Choppiness 14 is above 61.8). Adding TEMA
  or VWAP to the registry is its own item.
- **No Risk category.** A risk template needs a position or account condition, and the
  Combo builder does not open those; loading one would land in a locked tab. The
  categories shown are derived from the library, so one appears once a template needs it.
- **"Confirmed by volume" is a volume-average comparison.** The Combo builder's left side
  is always an indicator, so raw candle volume cannot be a leg. The template reads
  `volume_ma(5) > volume_ma(20)`: recent volume above its longer average.
- **Loading over a rule in progress asks once.** The draft has no undo, so the first click
  on a card shows "Replace my rule" / "Keep my rule" instead of discarding the conditions.
- **A template is a timeframe and a condition tree, laid over a fresh draft.** Symbol,
  identity and lifecycle defaults come from the panel's own blank draft, so there is one
  definition of a blank rule rather than a second one in the library.

## Out of scope

- User-saved and shared templates. Sharing a template is a Class B question and needs
  its own ADR.
- Backtest results shown on the card. Wanted, but it needs a backtest path first.

## Links

- [`FEAT-0304`](FEAT-0304-model-proposes-rules.md) — the register that reads these hashes
- [`FEAT-0030`](FEAT-0030-combined-alerts.md) — the builder templates load into
- `src/lib/alerts/templateLibrary.ts`, `src/components/alerts/tabs/TemplatesTab.svelte`
- Reference behaviour: Bitunix "Super Alert" Templates tab (described, not reproduced)
