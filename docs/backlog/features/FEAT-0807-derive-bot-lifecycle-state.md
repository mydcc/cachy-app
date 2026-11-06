---
id: FEAT-0807
title: Derive bot lifecycle state from the rule and the paper book
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: [FEAT-0806]
parent: FEAT-0805
size: M
estimate: 5
---

# FEAT-0807 — Derive bot lifecycle state from the rule and the paper book

## Problem

There is no way to ask "what is this bot doing right now?". The rule store knows
`enabled`, `fired_count` and anchors; the paper book knows positions; neither
knows about the other. The UI therefore cannot distinguish a bot that is armed
and waiting from one that is paused, expired, blocked by a broken condition, or
currently holding a position.

Storing a second state blob would create a second truth that drifts on reload.
The state must be derived.

## Proposal

A pure function `deriveBotState(rule, book, now)` returns one state plus
`hasPosition`, and a `botsState` store exposes it per rule, recomputed on
`alertState.rulesVersion` and on paper-book changes:

- `armed` — enabled, no owned position, valid.
- `submitting` — an entry for this rule is in flight (transient, from the
  existing per-rule in-flight guard).
- `in_position` — the book holds a position owned by this bot.
- `closing` — an exit has been submitted and the position has not closed yet.
- `closed` — no owned position, and the rule has fired at least once.
- `paused` — `enabled: false`.
- `blocked` — the evaluation report says the rule is unevaluable.
- `expired` — `valid_until_ms` is in the past and the rule never fired.

`paused` and `in_position` are not mutually exclusive in reality: a paused bot
can still hold a position. The state stays one value and `hasPosition` carries
the second fact, so the UI can say "paused, position open" without inventing a
compound enum.

No new persisted state. The store is a projection, not a source.

## Acceptance criteria

- [ ] `deriveBotState` is pure and table-driven tested for every transition,
      including paused with an open position, expired with a position, and a
      deleted rule with a lingering book row.
- [ ] The store recomputes on `rulesVersion` and on paper-book changes; no new
      `localStorage` key is introduced.
- [ ] A bot with no position and `enabled: true` reads `armed`, not `closed`.
- [ ] A bot with an owned position reads `in_position` (or `paused` +
      `hasPosition: true`) and never `armed`.
- [ ] The store exposes an owner index by `(symbol, side)` that FEAT-0808 and
      FEAT-0810 can consume, including the two-bot collision case.
- [ ] A paper-book parse failure degrades to `blocked` with a notice rather than
      throwing in the sidebar.

## Out of scope

- The Bots tab itself (FEAT-0808).
- Ownership reservation on entry (FEAT-0810).
- Persisting state; it is derived on every read.
- Exit evaluation.

## Open questions

- Whether `submitting` can be observed across a reload. Proposal: no; it is a
  session-only transient and the UI shows `armed` until the fill lands.
- Whether a paused bot keeps evaluating exits. Proposal: yes; tracked in
  [`TODO.md`](../../TODO.md#32-take-profit-and-exit-semantics).

## Links

- [`ADR-0026`](../../adr/0026-a-bot-owns-the-position-it-opens.md)
- [`FEAT-0806`](FEAT-0806-attribute-paper-trades-and-journal-entries-to-their-bot.md)
- [`FEAT-0808`](FEAT-0808-show-bots-in-the-positions-sidebar.md)
- Code: `src/stores/alerts.svelte.ts`, `src/stores/paperTrading.svelte.ts`,
  `src/services/alertEngine/botOrders.ts`
