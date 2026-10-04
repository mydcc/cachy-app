---
id: BUG-0597
title: "Bitget order placement still posts to the decommissioned V1 placeOrder, and the V2 order schema needs a split Cachy has not made"
type: bug
status: in-progress
priority: P0
milestone: none
created: "2026-09-30"
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: [BUG-0596, BUG-0580]
assignee: opencode
branch: docs/bug-0597-remove-demo-key-narrative
---

# Migrate the Bitget order write paths to V2

Row 1 and 4 of the mapping table in
[`docs/bitget-api/09_v1_vs_v2.md`](../../bitget-api/09_v1_vs_v2.md), split out of
[BUG-0576](BUG-0576-bitget-v1-api-decommissioned.md) because this is the one
part of the migration that can **quietly move money the wrong way**.

## Retargeting (2026-10-04, Phase A recon — no writes, no keys)

This item was written for Classic V2 (`side` + `tradeSide`). Every current
account is UTA, and **UTA has no `tradeSide` request field** — it appears only
in responses, computed by the venue. The UTA split is **`side` + `posSide`**
(`15_uta_writes.md`):

| Intent (hedge) | `side` | `posSide` |
|---|---|---|
| open long | `buy` | `long` |
| close long | `sell` | `long` |
| open short | `sell` | `short` |
| close short | `buy` | `short` |

One-way: no `posSide`, close via `reduceOnly: "yes"`.

This changes the hazard shape but not the acceptance: omitting `posSide` in
hedge mode violates a documented requirement (fail-closed, unlike V2's
`tradeSide` trap — unverified until observed), while a *wrong* `posSide`
still flips instead of flattening with a `00000` on the request. "Position
returns to flat" stays the criterion; "request returned 200" proves nothing.

What Phase A settled (docs only): UTA endpoint table (place `/api/v3/trade/
place-order`, modify `/api/v3/trade/modify-order`, cancel `/api/v3/trade/
cancel-order`, cancel-all `/api/v3/trade/cancel-symbol-order`, close-all
`/api/v3/trade/close-positions`, status `/api/v3/trade/order-info`),
place-order params (`category`, `qty` in base coin, `posSide` required in
hedge, `marginMode` defaulting to `crossed`, `clientOid` regex, preset TP/SL
fields for the BUG-0503 re-eval), live instrument minimums (BTCUSDT:
minOrderQty 0.0001, minOrderAmount 5 USDT — verification costs cents on the
trader's account), per-order entries in cancel-all/close-all responses (envelope `00000`
can carry a failed leg), and no documented `clientOid` idempotency (so no
write retries until a duplicate is observed rejected).

What stays observation-gated (asked, not inferred): posSide-omission behaviour,
clientOid-resubmission behaviour, the one-way `holdMode` wire literal, funding
and fee behaviour, and whether the account's mode can be switched in futures
settings (the UTA API has no set-position-mode endpoint — mode switches in
app UI per vendor support). Plus one precondition on the account holder:
the account's current holdMode.

## Symptom

**No Bitget order can be placed or closed.** Both go through
`POST /api/mix/v1/order/placeOrder`, which the venue rejects with
`30032 "The V1 API has been decommissioned"` before it looks at a signature.

The reason this is filed as its own item rather than folded into the parent:
once the path is corrected, the **next** failure mode is not an error at all.
A request that drops one field succeeds, returns 200, and does the opposite of
what the trader asked for.

## Evidence

**Demonstrated** for the deprecation, **derived** for the rest.

```bash
curl -s -X POST 'https://api.bitget.com/api/mix/v1/order/placeOrder' \
  -H 'Content-Type: application/json' -d '{}'
# {"code":"30032","msg":"The V1 API has been decommissioned…"}
```

Verified 2026-09-30. Cachy builds that body in
[`src/utils/exchange/bitgetBodies.ts:64`](../../../src/utils/exchange/bitgetBodies.ts)
and sends it via [`src/utils/server/venues/bitget.ts:68`](../../../src/utils/server/venues/bitget.ts);
the path comes from
[`src/utils/exchange/restSigningPlan.ts:288`](../../../src/utils/exchange/restSigningPlan.ts)
and `:289` (`close-position` — **the same path serves both order placement and
every close**).

## Cause

V1 and V2 model the intent of an order differently.

In V1 a single `side` field carries direction *and* open-versus-close:
`open_long`, `open_short`, `close_long`, `close_short`, built by `bitgetSide()`
at [`src/utils/exchange/bitgetBodies.ts:42`](../../../src/utils/exchange/bitgetBodies.ts).

In V2 `side` carries **direction only** (`buy` | `sell`) and a new `tradeSide`
field carries the close. The correct port decomposes the V1 value losslessly —
`close_long` becomes `side: buy` + `tradeSide: close` — and:

> `tradeSide` is the field carrying the close, so a port that drops it does not
> fail. It sends a valid **open long**. The order succeeds, the position
> doubles instead of flattening, and the only signal is the size.

That is why the acceptance criterion is "the position returns to flat", not "the
request returned 200".

Two more required fields, neither of which Cachy sends today: `place-order`
requires `productType` **and** `marginMode` (`isolated` | `crossed`). And V1's
misspelled `timInForceValue`
([`src/utils/exchange/bitgetBodies.ts:84`](../../../src/utils/exchange/bitgetBodies.ts))
becomes `force` with a different value set.

## Fix

Against a **real hedge-mode account**, in this order:

1. `placeOrder` → `place-order`; add `productType` and `marginMode`; rename
   `timInForceValue` → `force`.
2. Split `side` into `side` + `tradeSide` **deliberately**, with a test that
   fails if a close is ever sent without it.
3. **One-way mode is a separate branch.** Bitget documents `tradeSide` as
   ignored in one-way mode, where a close needs `reduceOnly: YES` with the
   transactional direction in `side`. That needs the `posMode` from
   [BUG-0596](BUG-0596-bitget-signed-read-paths-need-v2.md) — it cannot be
   derived from the order itself.
4. `cancel-order` → `cancel-order` (kebab-case) — a rename only.
5. Re-evaluate `bitgetCapabilities.tpSlAtEntry`
   ([`:40`](../../../src/services/exchange/bitgetCapabilities.ts)) against V2's
   `presetStop*` fields on `place-order`, with a test added *before* the value
   is flipped. This answers [BUG-0503](BUG-0503-bitget-entry-opens-a-position-that-can-never-be-protected.md).

**Leave alone.** The refusal design. Per BUG-0001 no step may be completed
against a guessed wire format — and this is the item where that rule costs the
most, because the guess that costs the most here is the one that succeeds.
`BITGET_UNSUPPORTED_PROTECTION_FIELDS` keeps refusing until step 5 gives each
field a verified shape.

## Acceptance criteria

- [ ] A test reproduces the defect and fails without the fix — no
      `/api/mix/v1/` path in `BITGET_ORDER_PATHS`
- [ ] No request body contains `timInForceValue`
- [ ] `place-order` sends `productType` and `marginMode`
- [ ] A close on a **hedge-mode** account returns the position to flat,
      verified against a real position — not merely a 200 response
- [ ] A test fails if a close is sent without its close-carrying field
      (`tradeSide` on Classic V2; on UTA hedge that field is `posSide`)
- [ ] One-way mode is handled explicitly, on its own branch, since `tradeSide`
      is ignored there
- [ ] The order response shape is observed in a live V2 call and recorded, not
      taken from the documentation alone
- [ ] `bitgetCapabilities.tpSlAtEntry` is re-evaluated against V2, with a test
      added before the value is flipped
- [ ] The test passes with the fix

## Links

- BUG-0576 — the parent migration
- BUG-0596 — supplies `posMode`, which the one-way branch needs
- BUG-0580 — query-parameter ordering, a prerequisite for the signed reads this
  depends on
- BUG-0001 — never guess an exchange's wire format for a call that moves money
- BUG-0503 — the unprotected window that `presetStop*` closes
- BUG-0514 — bulk close; the native endpoint is V1 and unreachable until this
  is fixed
- [`docs/bitget-api/09_v1_vs_v2.md`](../../bitget-api/09_v1_vs_v2.md)