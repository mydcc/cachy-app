---
id: FEAT-0812
title: Review a bot's track record in the journal
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: [FEAT-0806, FEAT-0810]
parent: FEAT-0805
size: M
estimate: 5
---

# FEAT-0812 — Review a bot's track record in the journal

## Problem

A paper bot you cannot review has taught you nothing, and reviewing is most of
what paper trading is for. Today the journal can filter paper trades but cannot
say which bot produced one, so "keep this bot, change it, or delete it" is a
guess (FEAT-0806 fixes the data; this item uses it).

## Proposal

Add per-bot views and statistics to the journal:

- Filter by bot (and "manual only" / "bots only").
- Per bot: number of trades, win rate, average R, expectancy, max drawdown,
  total PnL, average holding time, and a small equity sparkline.
- A position opened by a bot but closed by hand is labelled
  "bot-opened, manually closed"; the statistics show it separately rather than
  pretending the bot's exit worked.
- Trades opened before FEAT-0806 stay unattributed and are excluded from
  per-bot statistics with a visible note.
- The stats are derived from journal entries; no second ledger.

## Acceptance criteria

- [ ] The journal filters by bot, by "bots only", and by "manual only".
- [ ] Each bot's card shows trades, win rate, average R, expectancy, max
      drawdown and total PnL, all computed with `Decimal`.
- [ ] A bot-opened position closed manually is counted and labelled as such; it
      is not counted as a bot exit.
- [ ] Unattributed legacy trades are excluded from per-bot stats with a visible
      explanation.
- [ ] Deleting a bot keeps its closed trades attributable in the journal.
- [ ] Component tests cover the empty state, a bot with mixed exits, and a
      legacy unattributed trade.

## Out of scope

- Equity curves beyond a sparkline; full charting is the journal's own area.
- Comparing bots against each other or ranking them.
- Tax, export or reporting formats.
- Attribution for trades that predate FEAT-0806.

## Open questions

- Whether "bot-opened, manually closed" counts toward the bot's win rate.
  Proposal: show it in a separate row, not in the win rate, because the exit was
  not the bot's decision.
- Whether stats should be per rule version (`strategyHash`) or per bot id when a
  rule was edited; proposal: per hash, with the bot name as the grouping label.

## Links

- [`ADR-0026`](../../adr/0026-a-bot-owns-the-position-it-opens.md)
- [`FEAT-0806`](FEAT-0806-attribute-paper-trades-and-journal-entries-to-their-bot.md)
- [`FEAT-0810`](FEAT-0810-execute-bot-exits-through-the-order-gate.md)
- Code: `src/stores/journal.svelte.ts`,
  `src/components/shared/JournalContent.svelte`,
  `src/components/shared/journal/*`
