---
id: FEAT-0396
title: An Automation settings tab for user-configured bots
type: feature
status: idea
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

## Acceptance criteria

- [ ] The Automation tab lists, creates, edits, enables and disables bots
- [ ] A bot is a `RuleDocument`; enabling one does not change its content hash
- [ ] No document created in this tab can carry `consequence_level: send` — attempting
      it is refused by `validate()`, not hidden by the UI
- [ ] A fired bot rule produces a simulated order in the paper account and nothing else
- [ ] Existing risk limits apply to simulated orders
- [ ] Each bot shows its rule as a plain-language sentence, in both locales, the same way
      the alert panel does
- [ ] Disabling a bot stops evaluation, and Manage shows it as disabled rather than absent
- [ ] German and English strings

## Out of scope

- Live execution. [`FEAT-0035`](FEAT-0035-autonomous-execution-agent.md).
- Model-proposed bots. [`FEAT-0304`](FEAT-0304-model-proposes-rules.md).
- Backtesting a bot before arming it. Wanted, and it needs a backtest path first.

## Open questions

- **How does a trader promote an alert to a bot?** Raising `consequence_level` changes
  the content hash — correctly, since it changes what the rule does. Whether that reads
  as "the same rule, promoted" or "a new rule derived from it" is a product decision
  with an audit consequence, and it should be answered before the UI implies one.

## Links

- [`docs/alert-system.md`](../../alert-system.md) — one document, three surfaces
- [`ADR-0012`](../../adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md)
- [`FEAT-0035`](FEAT-0035-autonomous-execution-agent.md) — the `send` rung
- `src/components/settings/tabs/`, `src/stores/ui.svelte.ts`
