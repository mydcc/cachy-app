---
id: FEAT-0805
title: Bot system v2 — from conditional orders to strategies
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: required
depends_on: []
size: XL
---

# FEAT-0805 — Bot system v2: from conditional orders to strategies

## Problem

Today a bot is an alert with `consequence_level: "simulate"`: it fires once per
evaluation, submits a market entry with a fixed stop, and is finished. It does
not own the position it creates, cannot close it on a thesis change, cannot take
profit, and does not appear anywhere until it has already acted. The paper book
and the journal cannot say which bot produced a trade, so a bot cannot be
reviewed, compared or trusted.

At the same time the condition builder stops at five flat conditions while the
core can nest eight levels, and there is no way to express the context that a
professional trader expects a bot to respect (volatility regime, session,
external aggregates) — or to see why a bot did *not* act.

This is not a one-PR fix. It is a second rung on the ladder that keeps the first
rung intact.

## Proposal

Keep the current conditional market order as **stage 2** and add the rungs above
it. All stages share one condition language, one evaluator and one `OrderGate`:

| Stage | What it is | Status |
| --- | --- | --- |
| 1 — Alert | A `notify` rule: announces, does not act | today |
| 2 — Bot | A `simulate` rule: conditional market entry + stop | today, unchanged |
| 3 — Superbot | Stage 2 plus position ownership: exits, take profit, journal identity, sidebar presence | this epic |
| 4 — Grid bot | An order set plus the position it accumulates | this epic |

Work is split into child items by milestone:

- **M1 — Foundation:** [`FEAT-0806`](FEAT-0806-attribute-paper-trades-and-journal-entries-to-their-bot.md),
  [`FEAT-0807`](FEAT-0807-derive-bot-lifecycle-state.md),
  [`FEAT-0808`](FEAT-0808-show-bots-in-the-positions-sidebar.md).
- **M2 — Exits:** [`FEAT-0809`](FEAT-0809-rule-exit-conditions-in-the-strategy-document.md),
  [`FEAT-0810`](FEAT-0810-execute-bot-exits-through-the-order-gate.md),
  [`FEAT-0811`](FEAT-0811-superbot-editor-for-exit-conditions.md),
  [`FEAT-0812`](FEAT-0812-per-bot-journal-analytics.md).
- **M3 — Conditions:** [`FEAT-0813`](FEAT-0813-condition-builder-v2-more-conditions-and-nested-groups.md),
  [`FEAT-0814`](FEAT-0814-author-and-audit-veto-conditions.md).
- **M4 — Awareness:** [`FEAT-0815`](FEAT-0815-volatility-regime-and-session-operands.md),
  [`FEAT-0816`](FEAT-0816-external-market-context-as-a-veto-feed.md),
  [`FEAT-0817`](FEAT-0817-ai-assisted-rule-authoring.md),
  [`FEAT-0818`](FEAT-0818-curated-literature-strategy-templates.md).
- **M5 — Grid:** [`FEAT-0819`](FEAT-0819-grid-bot-runtime-on-the-paper-account.md),
  [`FEAT-0820`](FEAT-0820-grid-bot-controls-and-chart-visualisation.md).

The ownership decision is [`ADR-0026`](../../adr/0026-a-bot-owns-the-position-it-opens.md);
the grid shape is [`ADR-0027`](../../adr/0027-a-grid-bot-owns-an-order-set-and-its-position.md).

## Acceptance criteria

- [ ] `ADR-0026` is accepted before any exit execution merges.
- [ ] `ADR-0027` is accepted before any grid runtime merges.
- [ ] Every stage uses one condition language, one evaluator and one `OrderGate`;
      no second execution path exists (ADR-0012 decision 5).
- [ ] Paper positions, fills and journal entries attribute a bot trade to the
      bot that opened it, and a manual trade is distinguishable.
- [ ] A waiting bot is visible before it acts, and an open bot position names
      its owner.
- [ ] The current conditional market order keeps working unchanged; stage 3 is
      an addition, not a replacement.
- [ ] No new server call and no new Class B feature: rules, positions and the
      journal stay on the device (ADR-0001).
- [ ] Every new string exists in both `src/locales/locales/de.json` and
      `src/locales/locales/en.json`.
- [ ] Each child item's acceptance criteria are met, or the item records why it
      was dropped.

## Out of scope

- Live execution (`send`) and [`FEAT-0035`](FEAT-0035-autonomous-execution-agent.md).
- A backtesting engine.
- Cloud sync of rules, positions or journal entries.
- New venues or exchange adapters.
- An AI decision at execution time; AI is an authoring aid only (ADR-0012).
- Portfolio-level allocation across bots, correlation limits and a shared risk
  budget beyond the existing gate limits.

## Open questions

- Whether a superbot and a grid may run on the same symbol and side at the same
  time. Proposal: no, one owner per `(symbol, side)` (ADR-0026).
- Whether a paused bot keeps evaluating its exits. Proposal: yes — pause stops
  entries, exits keep protecting. Tracked in
  [`TODO.md`](../../TODO.md#32-take-profit-and-exit-semantics).
- Public naming of the stages: "Bot" and "Superbot" are working names. Tracked
  in [`TODO.md`](../../TODO.md#36-public-naming-for-the-bot-stages).

## Links

- [`ADR-0026`](../../adr/0026-a-bot-owns-the-position-it-opens.md) — a bot owns the position it opens.
- [`ADR-0027`](../../adr/0027-a-grid-bot-owns-an-order-set-and-its-position.md) — a grid owns an order set.
- [`ADR-0012`](../../adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md) — strategy is data, not a model opinion.
- [`ADR-0020`](../../adr/0020-automation-envelope-promotion-and-simulate-bots.md) — promotion derives a bot; simulate bots go through the gate.
- [`FEAT-0396`](FEAT-0396-automation-settings-tab.md) — the current bot envelope.
- [`FEAT-0391`](FEAT-0391-alert-template-library.md) — template library, extended by FEAT-0818.
- [`IDEA-0305`](../ideas/IDEA-0305-external-market-context-as-veto.md) — external context as a veto, built out by FEAT-0816.
- [`TODO.md`](../../TODO.md#32-take-profit-and-exit-semantics) — the decisions this epic waits on.
