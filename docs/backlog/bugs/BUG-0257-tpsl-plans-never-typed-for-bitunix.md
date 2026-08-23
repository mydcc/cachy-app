---
id: BUG-0257
title: Bitunix TP/SL plans carry no planType, so plansFor() never groups them
type: bug
status: specced
priority: P1
milestone: M3
editions: [community, pro, private]
area: exchange
data_class: A
adr: none
depends_on: []
estimate: 2
size: S
start_date: 2026-08-23
target_date: 2026-09-20
---

# BUG-0257 — Bitunix TP/SL plans carry no `planType`, so `plansFor()` never groups them

## Symptom

[`tpSlState.plansFor(symbol)`](../../../src/stores/tpsl.svelte.ts) is documented
to return the take-profit and stop-loss plans attached to a symbol. Against
live Bitunix data it returns an empty object for every symbol, because the
field it groups by does not exist on the objects it is given.

Anything that asks *"does this position already have a stop?"* therefore gets
*no* — including, once it is built, the create-vs-edit decision that
[`FEAT-0070`](../features/FEAT-0070-bitunix-tpsl-placement.md)'s third
acceptance criterion depends on.

## Cause

Three things that are each defensible and disagree with each other:

1. **The venue does not send `planType`.** `GET …/tpsl/get_pending_orders`
   returns, per [`06_tp_sl.md:173`](../../bitunix-api/06_tp_sl.md):
   ```json
   {"id":"123","positionId":"12345678","symbol":"BTCUSDT","base":"BTC",
    "quote":"USDT","tpPrice":"50000","tpStopType":"LAST_PRICE",
    "slPrice":"70000","slStopType":"LAST_PRICE","tpQty":"0.01","slQty":"0.01"}
   ```
   No `planType`, and no `triggerPrice` either.

2. **`fetchTpSlOrders` passes the raw objects straight through.** It
   de-duplicates and sorts them ([`tradeService.ts`](../../../src/services/tradeService.ts))
   but never maps them onto `TpSlOrder`'s declared shape. `planType` is
   declared on the interface and assigned nowhere in the file.

3. **`planTypeOf` reads `order.planType`** and returns `null` when it is
   absent ([`tpsl.svelte.ts:76`](../../../src/stores/tpsl.svelte.ts)), so every
   plan is skipped by the loop in `plansFor`.

### Why the tests do not catch it

`tpsl.test.ts`'s `plan()` helper builds
`{orderId, symbol, planType, triggerPrice, status}` — a shape the venue never
sends. The store's logic is proven correct on input it does not receive. This
is the gap worth closing first: a fixture built from the documented response
would have failed on the day the store was written.

## The deeper mismatch

`TpSlOrder` models **one leg** (`planType: "PROFIT" | "LOSS"`, one
`triggerPrice`). The venue returns **one row carrying both legs** (`tpPrice`
*and* `slPrice`, each with its own stop type and quantity). These are not the
same shape, and no amount of defaulting reconciles them — one row has to become
zero, one or two `TpSlOrder`s depending on which legs it carries.

Note that `tpSlState.updateFromWs` already does exactly this split for the
WebSocket channel: it applies each leg separately and synthesises a per-leg id.
The REST path needs the same treatment, and the two should agree on how a leg
id is formed or the WS update will not find the row the REST fetch created.

## Also unresolved: position-wide versus partial

The same response is the only source for both plan kinds, and it carries no
field distinguishing them. The plausible signal is the quantity — a
position-wide plan tracks the position and would have no `tpQty`/`slQty`, a
partial one names its size — but that is **inference, not documentation**, and
it decides whether the UI offers *create* or *edit*. Getting it wrong means
either a refused order (visible, harmless) or a second plan where the trader
expected an edit (quiet, and the position ends up covered twice).

Worth confirming against a live account before anything depends on it.

## Acceptance criteria

- [ ] `fetchTpSlOrders` normalises a Bitunix pending/history row into one
      `TpSlOrder` per leg present, with `planType` and `triggerPrice` set from
      `tpPrice`/`slPrice`, and the leg's own `tpQty`/`slQty`, stop type and
      order type carried across.
- [ ] Leg ids agree with the ones `updateFromWs` synthesises, so a WS push
      updates the row a REST fetch created instead of appending a duplicate.
- [ ] `plansFor()` returns the profit and loss plans for a symbol that has
      them, proven against a fixture copied from the documented response — not
      from a hand-written shape.
- [ ] A row carrying only one leg produces exactly one plan, not one plan and
      one empty.
- [ ] Whether a plan is position-wide or partial is either read from a
      confirmed field or explicitly recorded as unknown; no inference is relied
      on silently.

## Out of scope

- **Creating plans.** [`FEAT-0070`](../features/FEAT-0070-bitunix-tpsl-placement.md)'s
  transport and service layer are already built and independent of this — they
  send, they do not read.
- **Bitget.** Its TP/SL path is separate and not implicated here.

## Links

- [`FEAT-0070`](../features/FEAT-0070-bitunix-tpsl-placement.md) — blocked on this for its create-vs-edit criterion
- [`FEAT-0072`](../features/FEAT-0072-bitunix-tpsl-ws-channel.md) — the WS channel whose split this should match
- [`06_tp_sl.md`](../../bitunix-api/06_tp_sl.md) — the documented response shape
- `src/stores/tpsl.svelte.ts` — `planTypeOf`, `plansFor`, `updateFromWs`
- `src/services/tradeService.ts` — `fetchTpSlOrders`, `TpSlOrder`
