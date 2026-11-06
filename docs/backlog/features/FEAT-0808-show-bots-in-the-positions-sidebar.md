---
id: FEAT-0808
title: Show bots in the positions sidebar with their state and owner links
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: [FEAT-0806, FEAT-0807]
parent: FEAT-0805
size: M
estimate: 5
---

# FEAT-0808 — Show bots in the positions sidebar with their state and owner links

## Problem

`PositionsSidebar` has tabs for positions, orders, TP/SL and history. A bot that
is armed and waiting is none of those, so it appears nowhere; when it fires, the
first thing the trader sees is a position with no indication of which bot
opened it. This is exactly the "I only learn about the position after it exists"
gap.

## Proposal

Add a **Bots** tab to the sidebar and make ownership visible in both directions:

- One row per bot rule: state chip (`armed`, `in_position`, `paused`,
  `blocked`, `expired`), symbol, a short condition sentence, the trigger
  timeframe, and — when it owns a position — a link to that position.
- The row shows no PnL of its own while a position is open; the position book
  remains the single source for money. The bot row links to it.
- Position rows opened by a bot get a badge with the bot name and a link back to
  the Bots tab.
- Quick action: pause/resume. Editing and deletion stay in the control center
  until FEAT-0811.
- Non-modal, keyboard reachable, labelled; DE/EN strings.

The tab is a projection over FEAT-0807; it does not add state.

## Acceptance criteria

- [ ] Every bot rule appears in the Bots tab, including one that has never fired,
      with its state and symbol.
- [ ] A bot that owns a position renders `in_position` and links to the position
      row; the bot row itself renders no PnL figure.
- [ ] A position opened by a bot carries a badge with the bot name and a link to
      the Bots tab; a manual position carries none.
- [ ] Pause/resume from the tab writes only `enabled` and survives a reload.
- [ ] A paused bot with an open position reads "paused, position open" instead of
      pretending to be flat.
- [ ] The tab is reachable by keyboard, every control has an accessible name,
      and the labels exist in both locales.
- [ ] Component tests cover: waiting bot visible, bot-opened position badge,
      paused-with-position, empty state.

## Out of scope

- Distance-to-trigger and proximity sorting (separate alert-panel epic).
- The exit editor (FEAT-0811).
- A kill switch that flattens positions (FEAT-0810 provides the primitive).
- Replacing the control center's Bots tab; both read the same store.

## Open questions

- Whether the tab is visible in all editions. Proposal: yes — bots are local and
  paper-only in this epic.
- Whether a bot that has never fired should be listed before an active one.
  Proposal: sort by state first (in position, armed, paused, blocked, expired),
  then symbol.

## Links

- [`ADR-0026`](../../adr/0026-a-bot-owns-the-position-it-opens.md)
- [`FEAT-0806`](FEAT-0806-attribute-paper-trades-and-journal-entries-to-their-bot.md)
- [`FEAT-0807`](FEAT-0807-derive-bot-lifecycle-state.md)
- [`FEAT-0749`](FEAT-0749-control-center-window-for-alerts-and-bots.md) — the control center Bots tab this mirrors.
- Code: `src/components/shared/PositionsSidebar.svelte`,
  `src/components/alerts/bots/BotsTab.svelte`
