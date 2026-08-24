---
id: BUG-0293
title: modifyTpSlOrder sent a wire body the venue's modify_order does not document
type: bug
status: done
priority: P0
milestone: M3
editions: [community, pro, private]
area: exchange
data_class: A
adr: none
depends_on: []
estimate: 2
size: S
start_date: 2026-08-23
target_date: 2026-08-23
---

# BUG-0293 — `modifyTpSlOrder` sent a wire body the venue's `modify_order` does not document

## Symptom

Found while building [`FEAT-0070`](../features/FEAT-0070-bitunix-tpsl-placement.md)'s
create UI, which was going to route "position already has a plan" to the
existing edit flow. Reading `POST /tpsl/modify_order`'s documented request
shape ([`06_tp_sl.md`](../../bitunix-api/06_tp_sl.md) §Modify TP/SL Order)
against what `tradeService.modifyTpSlOrder` actually sent turned up a
mismatch severe enough to stop and fix before building anything on top of it.

**What the code sent:**
```json
{"orderId": "...", "symbol": "BTCUSDT", "planType": "PROFIT", "triggerPrice": "50000"}
```

**What the endpoint documents:**
```
orderId (required), tpPrice, tpStopType, tpOrderType, tpOrderPrice, tpQty,
slPrice, slStopType, slOrderType, slOrderPrice, slQty
— at least one of tpPrice/slPrice required. No symbol, no planType.
```

Every field the code actually needed to move a price — `tpPrice` or
`slPrice` — was absent from every call this function ever made. `symbol` and
`planType` are not parameters of this endpoint at all; the order is
identified by `orderId` alone.

## Impact

`modifyTpSlOrder` is what every **Edit** button in [`TpSlList.svelte`](../../../src/components/shared/TpSlList.svelte)
and every chart-drag-to-move-a-stop interaction (FEAT-0247) calls. Since
neither `tpPrice` nor `slPrice` was ever sent, every such request violated the
venue's own "at least one of tpPrice/slPrice is required" rule — the most
likely outcome is the venue rejecting the call outright (visible as a failed
toast), not a silent no-op, but this was never confirmed against a live
account and the local schema validation would not have caught it: it
validated the same wrong shape the code sent.

`docs/bitunix-api/INTEGRATION_STATUS.md:89` marked this endpoint ✅
integrated. It was integrated against a shape of its own invention.

## Fix

- [`src/types/apiSchemas.ts`](../../../src/types/apiSchemas.ts) —
  `ModifyTpSlParams` now validates the documented shape (`tpPrice`/`slPrice`
  plus their stop type, order type/price and quantity; at least one of
  tpPrice/slPrice required) instead of `{symbol, planType, triggerPrice}`.
- [`src/services/tradeService.ts`](../../../src/services/tradeService.ts) —
  `modifyTpSlOrder` builds `tpPrice`+`tpStopType`(+`tpQty`) or
  `slPrice`+`slStopType`(+`slQty`) from `planType`, defaulting the stop type
  to `MARK_PRICE` to match the create flow. `symbol` is no longer sent on the
  wire (kept only in the top-level gate payload, which the route never
  forwards). `priceFields` now points the FEAT-0011 gate's price check at
  `params.tpPrice`/`params.slPrice` — the fields actually sent — rather than
  the old `params.triggerPrice`, which no longer exists.
- The public function signature (`orderId`, `symbol`, `planType`,
  `triggerPrice`, `qty?`) is unchanged, plus one new optional `stopType?`;
  every caller (`TpSlEditModal.svelte`, the chart-drag handler) needed no
  changes.

## Why the gate did not catch this earlier

`priceFields: { stopLoss: "params.triggerPrice", takeProfit: "params.triggerPrice" }`
pointed the FEAT-0011 gate's displayed-vs-wire check at the same field name
the (also wrong) wire body used. The gate compares what was shown to the
trader against what is on the wire; when both sides agree on a field the
exchange has never heard of, the check passes without verifying anything the
exchange would actually read. A field that is wrong in the same way on both
sides of a comparison is invisible to that comparison — the mismatch was only
visible against the API documentation, not from inside the app.

## Acceptance criteria

- [x] `modifyTpSlOrder` sends `tpPrice`/`slPrice` (with stop type, and
      quantity when given) matching the documented `modify_order` shape.
- [x] No `symbol` or `planType` field reaches the wire.
- [x] The gate's `priceFields` names the field actually sent, so a future
      rename cannot silently become invisible to the gate again.
- [x] Existing callers (`TpSlEditModal.svelte`, chart-drag) needed no changes.
- [x] Schema test proves the old shape is now rejected, not just that the new
      one is accepted.

## Out of scope

- **`cancelTpSlOrder`'s wire** also sends an undocumented `planType` field
  alongside the two required ones (`symbol`, `orderId`). Not fixed here: the
  required fields are present and correct, so this is very likely a harmless
  extra field rather than a broken call — a different class of problem than
  a request that mechanically cannot succeed. Worth a look if it turns out
  not to be harmless.
- **`position/modify_order`** (adding a leg to an existing position-wide plan)
  is not integrated at all (`INTEGRATION_STATUS.md:92`); out of scope here,
  relevant to FEAT-0070's UI.

## Links

- [`FEAT-0070`](../features/FEAT-0070-bitunix-tpsl-placement.md) — found while building this
- [`BUG-0292`](BUG-0292-tpsl-plans-never-typed-for-bitunix.md) — the read-side sibling of this write-side bug
- [`06_tp_sl.md`](../../bitunix-api/06_tp_sl.md) — the documented request shape
- `src/services/orderGate.ts` — `checkPrices`, the displayed-vs-wire comparison this bypassed

## What shipped

Shipped in 1.6.0-beta.108.
