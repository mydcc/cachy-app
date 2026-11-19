---
id: FEAT-0812
title: Review a bot's track record in the journal
type: feature
status: done
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
assignee: claude
branch: feature/feat-0812-per-bot-journal-analytics
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

- [x] The journal filters by bot, by "bots only", and by "manual only".
- [x] Each bot's card shows trades, win rate, average R, expectancy, max
      drawdown and total PnL, all computed with `Decimal`.
- [x] A bot-opened position closed manually is counted and labelled as such; it
      is not counted as a bot exit.
- [x] Unattributed legacy trades are excluded from per-bot stats with a visible
      explanation.
- [x] Deleting a bot keeps its closed trades attributable in the journal.
- [x] Component tests cover the empty state, a bot with mixed exits, and a
      legacy unattributed trade.

## Out of scope

- Equity curves beyond a sparkline; full charting is the journal's own area.
- Comparing bots against each other or ranking them.
- Tax, export or reporting formats.
- Attribution for trades that predate FEAT-0806.

## Decided

- **"Bot-opened, manually closed" stays out of the win rate.** Both proposals
  were taken as written. Such a trade is counted, labelled and shown in its own
  row with its own PnL, and it reaches none of the headline figures — win rate,
  average R, expectancy, drawdown, total PnL or the equity curve. The bot's
  exit never ran, so crediting or blaming it would answer the wrong question.
- **One record per `(botId, strategyHash)`,** with the bot's name as the
  grouping label and a short version badge shown only when a bot has more than
  one version.

## What had to be built first

FEAT-0806 recorded who *opened* a trade and deliberately stopped there —
`paperExchange` stamps attribution on the opening fill only, because
"attribution is an open-time fact". Nothing recorded who *closed* one, and the
close lane (`closePosition`) builds a `reduce` intent that carries no origin.
So the third acceptance criterion was not derivable from stored data.

Rather than overload `origin` on the closing fill (which would contradict that
decision), `JournalEntry` gained `exitOrigin`: the bot exit lane reports a
close that actually went through, through a required port, and completion marks
every other bot-opened entry as a manual exit. An absent value on a closed bot
trade reads as the bot's own exit, so entries written before this field keep
the figures they already had instead of being guessed at retroactively.

## Links

- [`ADR-0026`](../../adr/0026-a-bot-owns-the-position-it-opens.md)
- [`FEAT-0806`](FEAT-0806-attribute-paper-trades-and-journal-entries-to-their-bot.md)
- [`FEAT-0810`](FEAT-0810-execute-bot-exits-through-the-order-gate.md)
- Code: `src/stores/journal.svelte.ts`,
  `src/components/shared/JournalContent.svelte`,
  `src/components/shared/journal/*`
