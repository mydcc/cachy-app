---
id: FEAT-0327
title: Make a paper trade trackable, closable and journalled like a real one
type: feature
status: done
priority: P1
milestone: M1
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: [FEAT-0012]
assignee: claude
branch: worktree-papertrading-account-tracking-454885
---

# FEAT-0327 — Make a paper trade trackable, closable and journalled like a real one

## Problem

A paper trade can be opened, and then it disappears.

[`FEAT-0012`](FEAT-0012-paper-trading-mode.md) built one seam — the **write**
seam at `tradeService.signedRequest`. Everything that *reads* account state
goes around it and asks the real broker:

- `PortfolioInputs.handleFetchBalance` calls `/api/balance` directly, so the
  Account Size field (`#account-size`) fills with the **broker's** balance
  while paper mode is on. The number the calculator sizes against is not the
  number the simulated trade is charged to.
- `PositionsSidebar` calls `/api/positions`, `/api/orders` and `/api/account`
  directly, so `accountState.positions` and `accountState.openOrders` are only
  ever the broker's. A simulated position never reaches the Market Activity
  panel.
- Because it never reaches the panel, there is no card to click: no close, no
  TP/SL, no modify, no margin dialog. The close *path* works — it goes through
  the write seam — but nothing ever offers it.

Three further gaps follow from the same root:

- `paperTradingService.syncToStores` writes `omsService` and the balance, but
  never `accountState.positions`/`.openOrders` — the two arrays the panel
  actually renders. It also never removes a position the simulator closed.
- The simulator keeps no fill history. `paperExchange` answers a `history`
  request with `ok({ orders: [] })`, so nothing can reconstruct what happened,
  and no paper trade reaches the journal — even though `isPaper`, the journal
  filter and the `journalPaperTrades` setting all already exist.
- `paperTradingService.onPrice` is driven from `appEffects` for the *active*
  symbol only. A paper position in any other symbol never marks to market and
  its resting orders never trigger.

Together: paper mode places orders into a void. That defeats both purposes the
feature exists for — practising, and exercising the execution path end to end.

## Proposal

A **read seam**, one module, mirroring the write seam.

`paperAccountFeed` serves the four account reads from the simulated book in the
shapes the stores already hydrate from (`NormalizedPosition`,
`NormalizedOrder`, the `/api/account` field set). Each read site asks it once
and falls through to the venue when it returns `null`, so live behaviour is
untouched by construction.

On top of that seam:

- `paperTradingService` hydrates `accountState.positions` / `.openOrders` /
  balance from the book, so every existing card, dialog and list renders a
  simulated position with no paper-specific component — the FEAT-0012 rule,
  now actually reachable.
- `paperExchange` records every fill it executes into the book, and answers
  `history` from that record. Fills are the single source of truth for what
  happened; nothing is recomputed twice.
- The simulator notifies a listener after every mutation, so a fill reaches the
  UI on the fill, not on the next price tick.
- A tick over every symbol the book holds, not only the charted one.
- `paperJournalService` writes a journal entry when a position opens (status
  `Open`) and completes it when the position closes: weighted-average exit,
  fees, realised PnL and R multiple, all reconstructed from the fills. Marked
  `isPaper`, so it stays out of every performance statistic exactly as today.
- The order's leverage is injected the way the price feed is. The place-order
  payload carries no leverage field, so today every paper position reports 1x.

## Acceptance criteria

- [x] With paper mode on, `#account-size` fills from the simulated balance and
      reaches no network — asserted against a mocked network
- [x] A market order opened in paper mode appears in the Market Activity
      positions tab without waiting for a price tick
- [x] That position can be closed from its own card, and the close removes it
      from the panel
- [x] Its resting TP/SL plans appear in the orders tab and can be cancelled
- [x] A paper position marks to market in a symbol that is not the active chart
- [x] Opening a paper position writes an `Open` journal entry; closing it
      completes the same entry with exit price, fees, net PnL and R
- [x] A partial close leaves the entry `Open` and the position in the panel
- [x] Every journal entry written this way carries `isPaper: true` and none of
      them moves a performance statistic
- [x] `journalPaperTrades: false` writes nothing, and does not break the panel
- [x] Fills, fees and PnL are `Decimal` throughout
- [x] The read seam has exactly one module and its call sites are asserted by a
      test, the way the write seam's are
- [x] Live mode reads are unchanged — the paper branch is an early return

## Out of scope

- **Margin accounting and liquidation.** The simulator still charges only the
  fee on open; it does not reserve initial margin, split available from used,
  compute a liquidation price or liquidate. That is the second half of "feels
  like the broker" and is its own item, deliberately not bundled with the
  wiring here — the finance mathematics and the UI plumbing should not share
  one review.
- Funding fees on a held paper position.
- Independent TP/SL trigger semantics beyond what
  [`FEAT-0012`](FEAT-0012-paper-trading-mode.md) already ships.
- Backtesting. Still out of product scope per [`VISION.md`](../../VISION.md).

## Open questions

- Should a paper journal entry be deletable from the journal like any other, or
  owned by the simulator and re-derived? Currently: an ordinary entry, editable
  and deletable, and the simulator does not re-create it.

## What shipped

- `src/services/paperAccountFeed.ts` — the read seam. One module, four reads,
  `null` while paper mode is off so every call site falls through to the venue
  by construction. Its call sites are pinned by a test, the way the write
  seam's are.
- `src/stores/paperTrading.svelte.ts` — a fill record (`PaperFill`, capped at
  500), the plan metadata a venue row carries (`planGroupId`, `planType`,
  `stopType`, `planScope`), the balance a position was opened against, and
  `positionId → journal entry` links that survive a reload mid-trade.
- `src/services/paperExchange.ts` — records every fill it executes and answers
  `history` from that record; reports, creates, cancels and modifies TP/SL
  plans; cancels a closed position's plans the way the venue does; and
  announces every book change so a fill reaches the UI on the fill.
- `src/services/paperJournalService.ts` — reconciles the journal against the
  book rather than following a cursor, so a missed notification or an
  interrupted reload is self-correcting instead of writing a trade twice.
- `src/services/paperTradingService.ts` — hydrates `accountState`, mirrors
  removals into the OMS the gate reads, and marks the whole book to market on
  a timer rather than only the charted symbol.

## Found while building this

Four defects the original report did not name, each the same shape — a check
that asks "does a venue know us" where it means "is there anything here":

- **Every simulated entry was reported unprotected.** `handleTpSl` answered
  every read with an empty list and in the wrong envelope, so
  `orderPlacementService.confirmProtection` looked for the stop it had just
  attached and did not find it. The stop was there the whole time.
- **The Market Activity panel was hidden from paper traders.**
  `effectiveShowSidebarActivity` required API keys or Pro — so the panel this
  feature exists to be watched in was unreachable for someone practising
  before funding an account.
- **`fetchTpSlOrders` threw before the seam.** Its credential guard refused a
  read that goes through `signedRequest` and needs no credentials.
- **Every paper position reported 1x.** Bitunix's `place_order` carries no
  leverage field, so the simulator's payload default was the only source.

## Links

- [`FEAT-0012`](FEAT-0012-paper-trading-mode.md) — the write seam this extends
- `src/services/paperExchange.ts`, `src/services/paperTradingService.ts`,
  `src/stores/paperTrading.svelte.ts`
- `src/components/shared/PositionsSidebar.svelte`,
  `src/components/inputs/PortfolioInputs.svelte`
