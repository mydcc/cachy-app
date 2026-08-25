---
id: IDEA-0305
title: Use external market context as a veto, never as a trigger
type: idea
status: idea
priority: P3
milestone: M8
editions: [pro, private]
area: ai
data_class: C
adr: ADR-0012
depends_on: [FEAT-0303]
start_date: 2026-08-25
target_date: 2027-12-31
size: M
estimate: 3
---


# IDEA-0305 Use external market context as a veto, never as a trigger

## The thought

Aggregators — market-cap screeners, liquidation heatmaps, funding and open-interest
dashboards, sentiment indices — tell a trader things exchange candles do not. The
obvious move is to let a rule fire on them: "long when the heatmap shows a
liquidation cluster below".

That move is wrong, and
[ADR-0012](../../adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md)
decision 7 already forbids it. The reason is not squeamishness about third
parties:

- **They are not reproducible.** These feeds are derived, revised, and rarely
  versioned. A backtest over them describes a series that no longer exists, so a
  strategy triggered by them cannot honestly claim a tested edge.
- **They are outside our latency and correctness control.** A stale or wrong value
  from a vendor becomes an order, at machine speed, with nobody watching.
- **Their terms usually forbid it anyway.** Redistribution and automated-trading
  clauses on commercial market-data APIs are not decoration.

What they are genuinely good for is the opposite direction: **suppressing** a
trigger that the exchange data already produced, or annotating it so the trader
knows what the surroundings looked like. A veto that fails is a trade not taken —
recoverable. A trigger that fails is a position — not.

So: a rule fires from exchange candle and account data. External context may
downgrade or suppress that firing, or be recorded next to it, and its absence
must never block a rule from being evaluated. If the vendor is down, the rule
behaves exactly as if no veto were configured.

Class C under [ADR-0001](../../adr/0001-local-first-boundary.md): public market
data, which may reside anywhere but never next to a user identity. Which symbols
a trader watches is Class A, so a naive "fetch context for my watchlist" call
leaks strategy to a vendor — the same shape of mistake
[`BUG-0282`](../bugs/BUG-0282-ai-context-leaves-device-without-consent.md)
recorded for AI context.

## Open questions

- **Where does the fetch happen?** A server proxy keeps vendor keys off the
  client and can cache across users, but puts Cachy in the position of seeing
  which symbols are being asked about. A direct browser call avoids that and
  exposes the key. Neither is obviously right.
- **Is a veto part of the rule document, or a separate policy layer?** Inside the
  document it is versioned and diffable but pollutes a schema that is meant to be
  reproducible. Outside it, a rule's behaviour depends on state the rule does not
  name.
- **Which vendors, and does any of this survive their terms?** Worth reading
  before designing, not after.

## Links

- [ADR-0012](../../adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md)
  decision 7
- [ADR-0001](../../adr/0001-local-first-boundary.md) — Class C, and why symbols
  watched are not Class C
- [`FEAT-0303`](../features/FEAT-0303-strategy-rule-schema.md) — the rules this
  would annotate
- [`BUG-0282`](../bugs/BUG-0282-ai-context-leaves-device-without-consent.md) —
  the precedent for accidental egress
