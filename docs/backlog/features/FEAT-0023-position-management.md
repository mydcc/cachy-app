---
id: FEAT-0023
title: Manage open positions without leaving Cachy
type: feature
status: specced
priority: P1
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: [FEAT-0021]
estimate: 8
size: L
target_date: 2026-12-14
start_date: 2026-08-01
---


# FEAT-0023 — Manage open positions without leaving Cachy

## Problem

Cachy can open a position and then has little to say about it. Adjusting a stop,
taking partial profit or closing quickly all happen at the exchange.

## Proposal

This is an **epic**: five separate controls that share a subject (the open
position) but not an implementation. It was originally written as one `size: S`
item, which was wrong in a way worth recording — two of the five depend on
capabilities Cachy does not have yet, and bundling them meant either shipping
nothing or shipping a pull request that mixes a routine input with an
unverified exchange endpoint.

| Control | Where it is | Status |
|---|---|---|
| Modify position TP/SL after entry | [`FEAT-0254`](FEAT-0254-tpsl-input-range-slider-ux.md) | Done — slider and modes shipped |
| Partial close, by percentage or size | [`FEAT-0256`](FEAT-0256-partial-close-position.md) | In progress |
| Flash close | Needs [`FEAT-0024`](FEAT-0024-confirmation-policy.md) | Blocked — see below |
| Add to / reduce, average entry recomputed | Not yet split out | Ready to spec |
| Trailing stop and trailing TP/SL | Needs a verified endpoint | Blocked — see below |

**Flash close** is service-complete and UI-absent: `flashClosePosition` exists
in [`tradeService.ts:503`](../../../src/services/tradeService.ts) and nothing calls
it. Wiring it is small. What is not small is its confirmation — it is the most
dangerous control in the product (one click, full size, market price), its
default must be on, and turning it off must be a deliberate act. That is
[`FEAT-0024`](FEAT-0024-confirmation-policy.md)'s whole subject. Building a
bespoke dialog for one button first means building it twice and leaving the
second one inconsistent. Today the close button uses a bare `confirm()`
([`PositionsList.svelte:67`](../../../src/components/shared/PositionsList.svelte)),
which is the placeholder that FEAT-0024 replaces.

**Trailing stops** have no verified Bitunix endpoint in the current API doc
crawl — see [`INTEGRATION_STATUS.md`](../../bitunix-api/INTEGRATION_STATUS.md)
§Trade and [`FEAT-0070`](FEAT-0070-bitunix-tpsl-placement.md)'s own Out of
scope. Nothing can be built against it until the API is confirmed.

Every action is an order and passes the [`FEAT-0011`](FEAT-0011-preflight-order-verification.md)
gate.

## Acceptance criteria

This epic is done when each child item is done. It has no code of its own.

- [ ] [`FEAT-0254`](FEAT-0254-tpsl-input-range-slider-ux.md) — modify TP/SL ✅
- [ ] [`FEAT-0256`](FEAT-0256-partial-close-position.md) — partial close
- [ ] Flash close wired, behind [`FEAT-0024`](FEAT-0024-confirmation-policy.md)
- [ ] Add to / reduce with recomputed average entry — needs its own item
- [ ] Trailing stop — blocked on a verified endpoint
- [ ] Unsupported actions absent per [`FEAT-0017`](FEAT-0017-exchange-capability-model.md)
- [ ] Each action verified live on each supported exchange

The two criteria that outlive every child — *unsupported actions are absent per
capabilities* and *verified live* — stay here rather than being copied into each
child, because they are properties of the finished set, not of any one control.

## Out of scope

- **Anything a child item owns.** Add code to the child, not here.

## Open questions

- **Does add-to-position deserve its own item or does it belong with reduce?**
  They share the average-entry recomputation and the same panel; they differ in
  direction and in what the gate must check (an add opens exposure, a reduce
  cannot). Worth deciding before either is specced.

## Links

- [`FEAT-0254`](FEAT-0254-tpsl-input-range-slider-ux.md) — TP/SL input, done
- [`FEAT-0256`](FEAT-0256-partial-close-position.md) — partial close, in progress
- [`FEAT-0024`](FEAT-0024-confirmation-policy.md) — confirmation policy, blocks flash close
- [`FEAT-0017`](FEAT-0017-exchange-capability-model.md) — capability model
- [`FEAT-0011`](FEAT-0011-preflight-order-verification.md) — the gate every action passes
- `src/services/tradeService.ts` — `flashClosePosition`, `closePosition`
