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

Today a bot is an alert with `consequence_level: "simulate"`: it fires at
most once per evaluation and submits a market entry with a fixed stop. Under
the default `once` frequency it is then finished; a repeating frequency
(`every_time`, `once_per_candle_close`) can fire again on later candles —
with no firing policy, limits or visibility around that repetition.
It does not own the position it creates, cannot close it on a thesis change,
cannot take profit, and does not appear anywhere until it has already acted.
The paper book and the journal cannot say which bot produced a trade, so a
bot cannot be reviewed, compared or trusted.

At the same time the condition builder stops at five flat conditions while
the core can nest eight levels, a bot only exists through the promotion
detour from an alert, and there is no way to express the context a
professional trader expects — or to see why a bot did *not* act.

## Goal (final, owner-confirmed 2026-11-18)

> The trader can create **any bot he wants** — from a plain alarm to a
> strategy with his own exits. He keeps the **complete overview** of
> everything running, including bots that have not yet acted, and can
> **change any running strategy at any time without losing the track
> record**.

Three trader types measure every item (owner framing):
**A** — wants an alarm only. **B** — creates an alarm, promotes it later.
**C** — wants to trade a strategy directly, no detour.

Naming and vocabulary are decided in
[`TODO.md`](../../TODO.md#36--public-naming-for-the-bot-stages) — one
concept, "Bot", no stage names in the UI. Where the trigger-order metaphor
ends is documented in exactly one place:
[`docs/alert-system.md`](../../alert-system.md#bot-vs-order-where-the-trigger-order-metaphor-ends)
("Bot vs. order").

## Structure decision

The new window is the **workshop** (create · review · templates); the
**live overview lives in the trading sidebar** where the money already
lives — no second monitoring monolith. The existing alert and bots windows
keep running **in parallel short-term** and are replaced by the workshop
when it covers them.

## Proposal

All stages share one condition language, one evaluator and one `OrderGate`:

| Stage | What it is | Status |
| --- | --- | --- |
| 1 — Alert | A `notify` rule: announces, does not act | today |
| 2 — Bot | A `simulate` rule: conditional market entry + stop | today, unchanged |
| 3 — Strategy bot | Stage 2 plus position ownership: exits, take profit, journal identity, firing policy | this epic |
| 4 — Grid bot | An order set plus the position it accumulates | this epic |

Work is split into milestones:

- **M1 — Foundation:** [`FEAT-0806`](FEAT-0806-attribute-paper-trades-and-journal-entries-to-their-bot.md),
  [`FEAT-0807`](FEAT-0807-derive-bot-lifecycle-state.md),
  [`FEAT-0808`](FEAT-0808-show-bots-in-the-positions-sidebar.md),
  [`FEAT-0826`](FEAT-0826-overhaul-the-public-documentation-for-the-bot-era.md)
  (goal + vocabulary land early so docs and UI tell one story).
- **M2 — Exits, safety, scale:** [`FEAT-0809`](FEAT-0809-rule-exit-conditions-in-the-strategy-document.md),
  [`FEAT-0810`](FEAT-0810-execute-bot-exits-through-the-order-gate.md),
  [`FEAT-0822`](FEAT-0822-bot-firing-policy-and-guards.md),
  [`FEAT-0823`](FEAT-0823-confirmation-candle-as-an-entry-trigger-mode.md),
  [`FEAT-0811`](FEAT-0811-superbot-editor-for-exit-conditions.md) (now incl. direct creation and the firing-and-limits section),
  [`FEAT-0812`](FEAT-0812-per-bot-journal-analytics.md),
  [`FEAT-0824`](FEAT-0824-show-n-concurrent-positions-in-the-trading-frontend.md).
- **M3 — Conditions:** [`FEAT-0813`](FEAT-0813-condition-builder-v2-more-conditions-and-nested-groups.md),
  [`FEAT-0814`](FEAT-0814-author-and-audit-veto-conditions.md).
- **M4 — Awareness:** [`FEAT-0815`](FEAT-0815-volatility-regime-and-session-operands.md),
  [`FEAT-0816`](FEAT-0816-external-market-context-as-a-veto-feed.md),
  [`FEAT-0817`](FEAT-0817-ai-assisted-rule-authoring.md),
  [`FEAT-0818`](FEAT-0818-curated-literature-strategy-templates.md) (now incl. user templates with schema, export/import, backup).
- **M5 — Grid:** [`FEAT-0819`](FEAT-0819-grid-bot-runtime-on-the-paper-account.md),
  [`FEAT-0820`](FEAT-0820-grid-bot-controls-and-chart-visualisation.md).
- **M6 — Later, each its own decision:** [`FEAT-0825`](FEAT-0825-bind-every-bot-to-one-account-and-show-only-the-active-account.md);
  ideas parked so they cannot dilute the epic:
  [`IDEA-0827`](../ideas/IDEA-0827-backtesting-engine.md),
  [`IDEA-0828`](../ideas/IDEA-0828-node-based-strategy-editor.md),
  [`IDEA-0829`](../ideas/IDEA-0829-ai-agent-bot-authoring-and-audit.md),
  [`IDEA-0830`](../ideas/IDEA-0830-open-extension-architecture.md),
  [`IDEA-0831`](../ideas/IDEA-0831-community-template-exchange.md).

The ownership decision is [`ADR-0026`](../../adr/0026-a-bot-owns-the-position-it-opens.md);
the grid shape is [`ADR-0027`](../../adr/0027-a-grid-bot-owns-an-order-set-and-its-position.md).

## Implementation process (owner-ordered, binding for every item)

After each finished section, **two reviews** run before the section counts
as done: ① a code review of the section itself, and ② a **compatibility
review against the previously implemented item** — while the implementing
agent simultaneously plans whether everything will stay compatible with the
*next* feature. A section is not "done" when its own tests pass; it is done
when it is proven to fit what came before and what is planned after.

## Acceptance criteria

- [ ] `ADR-0026` is accepted before any exit execution merges; `ADR-0027`
      before any grid runtime merges.
- [ ] Every stage uses one condition language, one evaluator and one
      `OrderGate`; no second execution path exists (ADR-0012 decision 5).
- [ ] The trader can create a bot directly in the workshop — promotion from
      an alert remains a shortcut, never the only path (trader types B, C).
- [ ] Paper positions, fills and journal entries attribute a bot trade to
      the bot that opened it; a manual trade is distinguishable.
- [ ] A waiting bot is visible before it acts — in the sidebar first
      (FEAT-0808 phase A: its own tab; long-term phase B: among open orders
      as a state-colored conditional entry).
- [ ] Every firing policy and limit is user-settable and visible; the
      safety floor (mandatory stop, one gate, no exposure-increasing
      exits) is fixed and cannot be configured away (FEAT-0822).
- [ ] The current conditional market order keeps working unchanged; stage 3
      is an addition, not a replacement.
- [ ] The public docs carry the goal and the "Bot vs. Order" vocabulary
      (FEAT-0826); no stage names leak into UI strings.
- [ ] No new server call, no new Class B feature: rules, positions and the
      journal stay on the device (ADR-0001).
- [ ] Every new string exists in both `src/locales/locales/de.json` and
      `src/locales/locales/en.json`.
- [ ] Each child item's acceptance criteria are met, or the item records
      why it was dropped.

## Out of scope

- Live execution (`send`) and [`FEAT-0035`](FEAT-0035-autonomous-execution-agent.md).
- A backtesting engine ([`IDEA-0827`](../ideas/IDEA-0827-backtesting-engine.md) — deliberately its own idea).
- Cloud sync of rules, positions or journal entries.
- New venues or exchange adapters.
- An AI decision at execution time; AI is an authoring aid only (ADR-0012,
  [`IDEA-0829`](../ideas/IDEA-0829-ai-agent-bot-authoring-and-audit.md)).
- Portfolio-level allocation across bots beyond per-bot limits (FEAT-0822).

## Open questions

- Whether a strategy bot and a grid may run on the same symbol and side at
  the same time. Proposal: no, one owner per `(symbol, side)` (ADR-0026).
- Whether a paused bot keeps evaluating its exits. Proposal: yes — pause
  stops entries, exits keep protecting. Tracked in
  [`TODO.md`](../../TODO.md#32-take-profit-and-exit-semantics).
- Grid netting and edition questions remain open in
  [`TODO.md`](../../TODO.md#34-grid-bots-paper-first-netting-and-edition).

## Links

- [`ADR-0026`](../../adr/0026-a-bot-owns-the-position-it-opens.md) — a bot owns the position it opens.
- [`ADR-0027`](../../adr/0027-a-grid-bot-owns-an-order-set-and-its-position.md) — a grid owns an order set.
- [`ADR-0012`](../../adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md) — strategy is data, not a model opinion.
- [`ADR-0020`](../../adr/0020-automation-envelope-promotion-and-simulate-bots.md) — promotion derives a bot; simulate bots go through the gate.
- [`FEAT-0396`](FEAT-0396-automation-settings-tab.md) — the current bot envelope.
- [`TODO.md`](../../TODO.md#32-take-profit-and-exit-semantics) — the decisions this epic waits on.
