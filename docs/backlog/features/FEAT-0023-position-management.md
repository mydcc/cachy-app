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
| Partial close, by percentage or size | [`FEAT-0256`](FEAT-0256-partial-close-position.md) | Done |
| Flash close | [`FEAT-0330`](FEAT-0330-flash-close-wiring.md) | Done — FEAT-0024 shipped |
| Add to a position, average entry recomputed | [`FEAT-0334`](FEAT-0334-add-to-position.md) | Specced |
| Trailing stop and trailing TP/SL | [`FEAT-0335`](FEAT-0335-trailing-stop.md) | Blocked on a verified endpoint — see below |

**Flash close** shipped as [`FEAT-0330`](FEAT-0330-flash-close-wiring.md) once
[`FEAT-0024`](FEAT-0024-confirmation-policy.md) gave it a confirmation to sit
behind. It is the most dangerous control in the product — one click, full size,
market price — so its confirmation defaults to on and switching it off is a
deliberate act in settings. Waiting for the shared policy rather than building a
bespoke dialog for one button was the right call: the dialog it uses now serves
every other confirmable action too.

The bare `confirm()` this item once described in `PositionsList.svelte` is gone
— FEAT-0256 replaced it with `ClosePositionModal`, which asks the same question
and also answers *how much*.

**Add and reduce turned out not to be one control.** The question below asked
whether they belong together because they share the average-entry
recomputation. They do not share it: **a reduce does not move the average
entry** — closing part of a position realises PnL and leaves the remainder's
entry price where it was. The recomputation is add-only, and the reduce already
shipped as [`FEAT-0256`](FEAT-0256-partial-close-position.md). So the remaining
control is one item, [`FEAT-0334`](FEAT-0334-add-to-position.md), not two.

**Trailing stops** have no verified Bitunix endpoint in the current API doc
crawl — see [`INTEGRATION_STATUS.md`](../../bitunix-api/INTEGRATION_STATUS.md)
§Trade and [`FEAT-0070`](FEAT-0070-bitunix-tpsl-placement.md)'s own Out of
scope. Nothing can be built against it until the API is confirmed.

Every action is an order and passes the [`FEAT-0011`](FEAT-0011-preflight-order-verification.md)
gate.

## Acceptance criteria

This epic is done when each child item is done. It has no code of its own.

- [x] [`FEAT-0254`](FEAT-0254-tpsl-input-range-slider-ux.md) — modify TP/SL
- [x] [`FEAT-0256`](FEAT-0256-partial-close-position.md) — partial close, which is
      also the reduce this epic once listed alongside add
- [x] Flash close wired, behind [`FEAT-0024`](FEAT-0024-confirmation-policy.md) — [`FEAT-0330`](FEAT-0330-flash-close-wiring.md)
- [ ] [`FEAT-0334`](FEAT-0334-add-to-position.md) — add to a position, average
      entry recomputed
- [ ] [`FEAT-0335`](FEAT-0335-trailing-stop.md) — trailing stop, which cannot
      start until a trailing endpoint is verified against the live API. **This
      epic stays open until then**, and that is the correct outcome: closing it
      early would record a capability the product does not have.
- [ ] Unsupported actions absent per [`FEAT-0017`](FEAT-0017-exchange-capability-model.md)
- [ ] Each action verified live on each supported exchange

The two criteria that outlive every child — *unsupported actions are absent per
capabilities* and *verified live* — stay here rather than being copied into each
child, because they are properties of the finished set, not of any one control.

## Out of scope

- **Anything a child item owns.** Add code to the child, not here.

## Open questions

- ~~**Does add-to-position deserve its own item or does it belong with
  reduce?**~~ Answered 2026-09-02: they do not share the average-entry
  recomputation, because a reduce does not move the average entry. Reduce is
  [`FEAT-0256`](FEAT-0256-partial-close-position.md), already shipped; add is
  [`FEAT-0334`](FEAT-0334-add-to-position.md). See the Proposal.

## Links

- [`FEAT-0254`](FEAT-0254-tpsl-input-range-slider-ux.md) — TP/SL input, done
- [`FEAT-0256`](FEAT-0256-partial-close-position.md) — partial close, done
- [`FEAT-0334`](FEAT-0334-add-to-position.md) — add to a position
- [`FEAT-0335`](FEAT-0335-trailing-stop.md) — trailing stop, blocked on the API
- [`FEAT-0024`](FEAT-0024-confirmation-policy.md) — confirmation policy, blocks flash close
- [`FEAT-0017`](FEAT-0017-exchange-capability-model.md) — capability model
- [`FEAT-0011`](FEAT-0011-preflight-order-verification.md) — the gate every action passes
- `src/services/tradeService.ts` — `flashClosePosition`, `closePosition`
