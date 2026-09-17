---
id: FEAT-0396
title: An Automation settings tab for user-configured bots
type: feature
status: ready
priority: P2
milestone: M9
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0012
depends_on: [FEAT-0387, FEAT-0389]
size: M
estimate: 8
---

# FEAT-0396 — An Automation settings tab for user-configured bots

## Problem

The rule engine can already express "when this holds, place that order":
`consequence_level: simulate` and `send` exist, `OrderIntent` exists, and
`authorise()` gates them. There is nowhere to configure one. A trader who wants a
strategy to act rather than announce has no surface for it.

## Proposal

A new **Automation** tab in `src/components/settings/tabs/`, alongside `trading`,
`chart`, `ai` and the rest (the tab id goes in `settingsTab`, `src/stores/ui.svelte.ts`).

The tab lists bots. **A bot is a `RuleDocument` with `consequence_level: simulate`** —
the same document type the alert panel arms, at a higher rung of the same ladder. Each
bot has its own document, so a trader can run several with different symbols and
different risk.

The separation the user asked for is a separation of *surface*, not of *system*: the
alert panel shows `notify` rules, this tab shows `simulate` rules, and both are
evaluated by the same evaluator against the same conditions. That is what lets a
strategy be tested as an alarm and then promoted, without being rewritten and without
the two versions drifting.

**This item stops at `simulate`.** A bot here proposes an order into paper trading and
nothing reaches an exchange. Live sending is `FEAT-0035`, which brings the order gate,
the risk limits and the confirmation path with it — and that is a different
conversation about a different kind of mistake.

Reuses `PaperTradingSettings.svelte` for the simulated account and
`RiskLimitsSettings.svelte` for the bounds; neither needs a parallel version.

## Decisions (2026-09-17)

**Promotion derives a new document; it never mutates the alert in place.**
Raising `consequence_level` changes the content hash, and the hash *is* the strategy's
identity — it is what a journal entry or a decision log records. An in-place promotion
would leave every past announcement of that alert pointing at an identity the document
no longer has, and the surviving history would read as if the bot had been proposing
orders all along. Compare `enabled`, which is deliberately unhashed because arming is
not a change of strategy: raising the consequence level *is* one, and the hash already
says so. Promotion therefore writes a new document with a new `id`, and the source
alert is left exactly as it was — still armed, still announcing, unless the trader
disables it themselves.

**The derivation is recorded in `provenance`, and it is free.**
`"provenance"` is listed in `EXCLUDED_FROM_HASH`
(`technicals-wasm/src/rule/document.rs`), so a new field there changes neither the
bot's own hash nor any hash already recorded. The link is stored as the source's
**content hash**, not its `id`: `id` is local identity that a re-import can reassign,
while the hash is the identity the journal already uses, so "this bot descends from
that strategy" stays answerable across devices and exports.

**Consequence: a `Provenance` schema addition, not a free-text note.**
`Provenance` carries `#[serde(deny_unknown_fields)]`, so the new field has to be
declared in Rust and marked `#[serde(default, skip_serializing_if = "Option::is_none")]`
for every document written before it existed to keep parsing. As with any change to
`technicals-wasm/`, the committed `static/wasm/` artefacts must be rebuilt in the same
PR — they do not fail loudly when they lag the Rust source.

**Keeping both running is the point, not a side effect.**
The workflow this tab exists for is "test it as an alarm, then let it act while the
alarm keeps watching". Mutation would destroy exactly that: one document cannot be at
two consequence levels, so promoting in place silently ends the alert the trader was
still relying on.

## Acceptance criteria

- [ ] The Automation tab lists, creates, edits, enables and disables bots
- [ ] A bot is a `RuleDocument`; enabling one does not change its content hash
- [ ] No document created in this tab can carry `consequence_level: send` — attempting
      it is refused by `validate()`, not hidden by the UI
- [ ] Promoting an alert creates a **new** document with a new `id`; the source alert is
      left unchanged and still armed
- [ ] The promoted document records the source's content hash in `provenance`, and
      documents written before that field existed still parse
- [ ] Recording the derivation changes no content hash — the pinned-hash tests still pass
- [ ] A fired bot rule produces a simulated order in the paper account and nothing else
- [ ] Existing risk limits apply to simulated orders
- [ ] Each bot shows its rule as a plain-language sentence, in both locales, the same way
      the alert panel does
- [ ] Disabling a bot stops evaluation, and Manage shows it as disabled rather than absent
- [ ] The rebuilt `static/wasm/` artefacts ship in the same PR as the Rust change
- [ ] German and English strings

## Out of scope

- Live execution. [`FEAT-0035`](FEAT-0035-autonomous-execution-agent.md).
- Model-proposed bots. [`FEAT-0304`](FEAT-0304-model-proposes-rules.md).
- Backtesting a bot before arming it. Wanted, and it needs a backtest path first.
- Surfacing the derivation chain anywhere but the bot's own detail view. Showing an
  alert which bots descend from it is a reverse lookup, and it earns its own item.

## Links

- [`docs/alert-system.md`](../../alert-system.md) — one document, three surfaces
- [`ADR-0012`](../../adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md)
- [`FEAT-0035`](FEAT-0035-autonomous-execution-agent.md) — the `send` rung
- `technicals-wasm/src/rule/document.rs` — `Provenance`, `EXCLUDED_FROM_HASH`
- `src/components/settings/tabs/`, `src/stores/ui.svelte.ts`
