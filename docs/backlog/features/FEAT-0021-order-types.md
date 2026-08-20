---
id: FEAT-0021
title: Support market, limit, trigger and fixed-risk orders with TP/SL attached
type: feature
status: done
branch: claude/feat-0011-erledigen-k3fht2
priority: P1
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: [FEAT-0011, FEAT-0017]
estimate: 5
size: L
target_date: 2026-12-04
start_date: 2026-08-01
---


# FEAT-0021 — Support market, limit, trigger and fixed-risk orders with TP/SL attached

## Problem

Cachy calculates a position precisely and then offers a narrow way to place it.
A trader who wants a limit entry with a stop and two targets attached has to
assemble it at the exchange, which discards the precision the calculator
provided.

## Proposal

The full entry set, each sized by the existing calculator:

- **Market** — immediate, with slippage awareness
- **Limit** — resting, post-only where supported
- **Trigger / conditional** — activates at a price, then places market or limit
- **Fixed-risk** — the calculator's native mode: name the risk, the size follows

TP and SL attached at entry where the exchange supports it, otherwise placed as
follow-up orders with the dependency made explicit — a stop that silently failed
to attach is the most dangerous outcome in this item and must be surfaced
loudly, not logged.

Multi-target take-profit maps onto the existing multi-target calculator rather
than reimplementing it.

## Acceptance criteria

- [~] Each order type places correctly on each supported exchange, verified live
      — market and limit are covered by unit tests and by the paper simulator;
      **live verification against a funded account has not happened** and cannot
      be claimed from here. Trigger orders are not shipped, see below.
- [x] TP/SL attach at entry where supported; where not, the follow-up placement
      is confirmed and a failure is surfaced prominently
- [x] Sizes and prices come from the calculator, computed with `Decimal`, and
      match what the UI displayed
- [x] Every path passes the [`FEAT-0011`](FEAT-0011-preflight-order-verification.md) gate
- [~] Unsupported types are absent per [`FEAT-0017`](FEAT-0017-exchange-capability-model.md)
      — the behaviour is there, the source is not.
      [`FEAT-0017`](FEAT-0017-exchange-capability-model.md) is still `specced`
      and waits on [`FEAT-0016`](FEAT-0016-exchange-adapter-interface.md), so
      `src/services/exchangeCapabilities.ts` states the same facts by hand in
      the shape FEAT-0017 will serve them. FEAT-0017 replaces the table's
      source, not its consumers.
- [x] A partially placed order group (entry filled, stop rejected) is detected
      and reported, with a test
- [x] German and English strings — but see
      [`BUG-0215`](../bugs/BUG-0215-order-refusal-placeholders.md): the strings
      existed and the panel rendered gate refusals without their interpolation
      values, so traders saw literal `{field}` and `{age}`. Fixed there.

## Decisions

- **Sequencing: Bitunix only, behind a capability seam.** Bitget's wire format
  for attached TP/SL and conditional orders is not verified in this repo, and
  [`BUG-0001`](../bugs/BUG-0001-bitget-ws-field-mismatch.md) is what
  guessing an exchange's field names looks like in production. Bitget is
  declared as market/limit with no attached protection, which costs a feature;
  declaring more would fail after the trader has committed capital.

- **Rollback semantics — alert loudly and retry the stop, never auto-close.**
  This answers the open question the item called its most consequential.
  [`FEAT-0013`](FEAT-0013-risk-limits-and-kill-switch.md) already settled the
  principle for the kill switch: an automatic liquidation is a way to turn a
  scare into a loss. It holds harder here, where the trigger would be a failed
  *second* request rather than a deliberate act — closing on our own initiative
  realises a loss the trader never chose, on the strength of an error that may
  be transient. So the stop is retried (`STOP_RETRY_ATTEMPTS`), and if it is
  still absent the position is reported `unprotected` through a result the
  caller cannot render as a success. `orderPlacementService.test.ts` asserts
  that neither `closePosition` nor `flashClosePosition` is ever called, and
  that no second entry is placed while retrying.

## What shipped

- `src/services/exchangeCapabilities.ts` — the FEAT-0017 stand-in. Bitunix:
  market/limit, TP/SL at entry, four time-in-force values, one target. Bitget:
  market/limit, no attached protection. An exchange the table has never heard
  of gets nothing — an unknown venue is the one case where assuming capability
  is guaranteed to be wrong.
- `src/services/orderPlacementService.ts` — places entry and protection as one
  unit, then **verifies the protection separately**. Bitunix's `place_order`
  response returns an order id and says nothing about whether the attached
  `tpPrice`/`slPrice` became plans, so a silently dropped stop looks exactly
  like a success until someone looks. This looks, via
  [`FEAT-0057`](FEAT-0057-market-activity-panel-redesign.md)'s plan cache.
- `src/components/results/PlaceOrderPanel.svelte` — reads
  `tradeState.currentTradeData`, so the numbers submitted are the numbers
  displayed (and the gate re-derives them regardless). An unsupported order
  type is shown disabled with a reason rather than omitted, because a missing
  control looks like a missing feature. The unprotected outcome is a persistent
  `role="alert"` banner, not a toast that scrolls away.
- `tradeState.remoteAccountStateAt` — transient, excluded from the persisted
  snapshot, stamped by `fetchLeverageMarginMode`, so the gate's staleness check
  has something real to measure.

## Not shipped

- **Trigger / conditional orders.** The plan-order endpoint family is missing
  from the Bitunix doc crawl (see
  [`INTEGRATION_STATUS.md`](../../bitunix-api/INTEGRATION_STATUS.md)), so Cachy
  has no verified request shape for one. The UI shows the type disabled with a
  reason. It goes in when the crawl covers it, not before.
- **Fixed-risk as a distinct order type.** It is not one — it is how the
  calculator sizes every order Cachy places, so every entry here is already
  fixed-risk. No separate control was added for something that is always on.
- **A satisfiable freshness requirement, first time round.** The panel required
  a recent leverage/margin-mode read and wired nothing that produces one, so
  live orders went stale after a minute and paper orders were refused
  outright. [`BUG-0215`](../bugs/BUG-0215-order-refusal-placeholders.md) fixed
  it. Worth remembering when adding the next gate check: a check nothing
  satisfies is indistinguishable from a broken feature.
- **A retry that can actually re-place a stop.** `replaceStop` has nothing to
  call: `tpsl/place_order` is [`FEAT-0070`](FEAT-0070-bitunix-tpsl-placement.md).
  The retry therefore re-checks rather than re-places, and reaches the
  `unprotected` result — which is the honest outcome, not a silent one.

## Links

- Reference screenshots: Bitunix order panel — Limit / Fixed Risk, By Cost, trigger orders
- `src/lib/calculator.ts`, `src/services/tradeService.ts`
