---
id: BUG-0647
title: A Bitget price-only modify re-sent the resting size, so delta semantics would inflate the order
type: bug
status: done
priority: P1
milestone: none
editions: [community, pro, private]
area: execution
data_class: none
adr: none
depends_on: []
branch: fix/bitget-modify-no-implicit-qty
---

# A Bitget price-only modify re-sent the resting size

## Symptom

`tradeService.modifyOrder` filled a caller-omitted quantity from the live order
and sent it:

```ts
const qty = params.qty !== undefined ? formatApiNum(params.qty) : liveOrder.amount;
```

Every price-only amendment therefore carried `qty` equal to the order's current
size. Nothing misbehaved while Bitget's `qty` meant *replace*. If it means
*add*, a trader adjusting a limit price inflates their own order on every step —
`0.5` → `1.0` → `1.5` across three amendments — and each request looks correct
from the caller's side. The signal is only in the position afterwards.

Which of the two it is, nobody knows. Bitget's UTA `modify-order` page describes
`qty` as "Order quantity / Base coin / Either qty or price must be provided" and
does not say which. It is open question 6 in
[`docs/bitget-api/15_uta_writes.md`](../../bitget-api/15_uta_writes.md).

## Cause

The line is correct for Bitunix and was carried to Bitget unchanged. Bitunix's
`modify_order` lists `qty` as **required** and calls it an "exchange requirement"
that Cachy satisfies from the live order
([`docs/bitunix-api/07_trade.md:529`](../../bitunix-api/07_trade.md)) — so a
price-only amend has no other way through there. Bitget UTA takes qty and/or
price, so the backfill was never needed there, and it is the only part of the
code that assumed replace semantics without saying so.

## Fix

Venue-scoped. Bitunix keeps the backfill; Bitget omits `qty` when the caller
stated none. That is correct under both readings, which is the point: **the code
no longer depends on the answer.**

- replace semantics — the field was a no-op before, still absent now
- delta semantics — nothing travels, so nothing is added

## What this deliberately does not touch

The position-size caps. `previousQuantity` and `modifyQuantity` are read from
`params.qty` with their *own* live-order fallback, not from the payload this
change edits, so the exemption keyed on an absent quantity behaves exactly as
before and a Bitget price-only amendment is still measured against the resting
size. A test pins that with the same values on both venues, because the two
changes sit close enough that a later edit could plausibly couple them.

The gate's exemption being keyed on an absent quantity is BUG-0568's subject and
is untouched by this.

## Verification

- [x] Reverting the change fails exactly one test, with
      `expected '0.2' to be undefined` — naming the backfilled resting size, not
      something incidental
- [x] 47 tests green across `tradeService_modifyOrder`,
      `tradeService_modifyOrderGuards`, `bitgetUtaModify`, `bitgetUtaWrites`
- [x] The Bitunix half is pinned by the pre-existing "keeps a price-only
      amendment approved and on the live size", which the change must not break
- [x] The wire body stays clean: `cleanPayload` in the venue builder drops the
      key, already pinned by `bitgetUtaModify.test.ts` ("modifies price only")

## Still open

Question 6 itself. This change makes the code safe either way, but it does not
tell anyone what Bitget actually does — a trader-side observation still settles
it (IDEA-0620). Until then the field is simply not sent, which is the honest
position: no invented certainty, no exposure.

## Links

- BUG-0597 — the UTA write port this belongs to
- BUG-0568 — the size-cap exemption that is quantity-shaped
- BUG-0576 — the V1→UTA migration umbrella