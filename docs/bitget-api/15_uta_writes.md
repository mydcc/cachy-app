# UTA writes — `/api/v3/trade/*` (order placement, modify, cancel)

Source: <https://www.bitget.com/legacy-docs/uta/trade/*>, transcribed 2026-10-04.
Base domain REST: `https://api.bitget.com`. All calls below are signed with the
same HMAC scheme as the reads (`14_uta_v3.md`).

Every claim marked **Documented** is transcribed from a vendor page and was not
observed. Claims marked **Verified** were observed live. Anything else is an
**open question** with the method that settles it — Phase B+ answers them on
demo keys, never by inference.

## The generation correction

BUG-0597 was written for Classic V2, where the order schema splits direction
(`side`) from open-versus-close (`tradeSide`). **UTA has no `tradeSide`
request field.** The UTA Place-Order page lists no such parameter; `tradeSide`
appears only in *responses* (the fills sample carries `tradeSide: "open"`,
computed by the venue). The split on UTA is **`side` + `posSide`** instead.

The hazard transfers with a different shape (see below).

## Endpoints

| Action | Method + path | Params | Result |
|---|---|---|---|
| place | `POST /api/v3/trade/place-order` | body (below) | `00000`, `data: {orderId, clientOid}` — **Documented** |
| modify | `POST /api/v3/trade/modify-order` | orderId\|clientOid + symbol + category + qty and/or price | **Documented**, unverified |
| cancel one | `POST /api/v3/trade/cancel-order` | orderId\|clientOid + category | **Documented**, unverified |
| cancel symbol/all | `POST /api/v3/trade/cancel-symbol-order` | category + optional symbol | **Documented**, unverified — the rollback path |
| close all | `POST /api/v3/trade/close-positions` | category + optional symbol/posSide | **Documented**, unverified — per-order results, partial failure possible. Path taken from the vendor nav grouping (Position Management); the position page slugs do not resolve to fetchable text, so re-confirm at implementation time |
| order status | `GET /api/v3/trade/order-info` | orderId\|clientOid | **Documented**, unverified — the verification read |
| instrument meta | `GET /api/v3/market/instruments` | category + optional symbol, public | **Verified** (below) |

`cancel-symbol-order` without `symbol` closes everything in the category;
`close-positions` without `symbol` closes all positions. Both answer per-order
`{orderId, clientOid, code, msg}` — a `00000` envelope can still carry a failed
leg (`"code": "24056", "msg": "notExisted"` in the documented sample). A caller
that checks only the envelope reads a partial rollback as a success.

## Place-order body (UTA)

Required: `category` (`USDT-FUTURES`), `symbol` (bare pair, `BTCUSDT`),
`qty` (base coin for USDT futures), `side` (`buy` | `sell`), `orderType`
(`limit` | `market`). `price` is required for limit, absent for market.
`timeInForce` is required for limit, defaults to `gtc`.

- `posSide` (`long` | `short`): optional in general, **required in hedge-mode
  positions**, futures only.
- `marginMode` (`crossed` | `isolated`), futures only, **defaults to `crossed`**
  when omitted. Explicit is better: positions carry their own `marginMode`.
- `reduceOnly` (`yes` | `no`, default `no`): `yes` means the order may only
  reduce the position. Per the page's Open Position Logic section this is the
  one-way-mode close (there is no `tradeSide` to carry it); paraphrased, not
  quoted — the param description itself carries no mode qualifier.
- `clientOid`: 1–32 chars, `^[.A-Z:/a-z0-9_-]{1,32}$`. No documented
  duplicate behaviour — the page says nothing about resubmission, so **no
  auto-retry on writes** until a duplicate is observed rejected.
- `stpMode`: `none` (default) | `cancel_taker` | `cancel_maker` | `cancel_both`.
- Preset protection: `takeProfit` + `stopLoss` (trigger prices),
  `tpTriggerBy` / `slTriggerBy` (`market` | `mark`, default market),
  `tpOrderType` / `slOrderType` (`limit` | `market`),
  `tpLimitPrice` / `slLimitPrice` (limit only). Futures only. This is the
  material for the `tpSlAtEntry` re-evaluation (BUG-0503). Note a vendor
  label typo: the place-order page titles the TP trigger param
  `stpTriggerBy`, but the curl sample and the modify-order page use
  `tpTriggerBy` — the wire field is `tpTriggerBy`.

## The close matrix (hedge mode)

| Intent | `side` | `posSide` |
|---|---|---|
| open long | `buy` | `long` |
| close long | `sell` | `long` |
| open short | `sell` | `short` |
| close short | `buy` | `short` |

Omitting `posSide` in hedge mode violates a documented requirement, so the
venue should reject it — **fail-closed**, unlike Classic V2's `tradeSide`
trap. Unverified until a demo probe (open question 1): if the venue ever
accepts a posSide-less hedge order, the builder must refuse it before signing.

The remaining hazard is a *wrong* `posSide`: `side: sell` + `posSide: short`
opens a short where `posSide: long` would have closed one. The position flips
instead of flattening, the request returns `00000`, and the only signal is the
position afterwards. That is why the acceptance stays "position returns to
flat", not "request returned 200".

One-way mode: no `posSide`, direction in `side`, close via `reduceOnly: "yes"`.

## Instrument minimums, live (BTCUSDT, USDT-FUTURES, 2026-10-04)

`GET /api/v3/market/instruments?category=USDT-FUTURES&symbol=BTCUSDT` →
`00000`, one entry:

```
minOrderQty: 0.0001, minOrderAmount: 5 (USDT), quantityPrecision: 4,
pricePrecision: 1, makerFeeRate: 0.0002, takerFeeRate: 0.0006,
minLeverage: 1, maxLeverage: 150, status: online
```

A minimal verification round-trip (open + close 0.0001 BTC as taker) costs on
the order of two taker fees on ~$11 notional — cents, and virtual on demo.
No funded account is needed for any verification step.

## Position mode switching

The UTA API nav lists no set-position-mode / set-margin-mode / set-leverage
endpoint (Classic had all three). The vendor support article says the two
position modes switch *"in the futures settings"* — i.e. app UI, not API.
So the demo account's `holdMode` is whatever the futures settings say, and the
API only ever *reads* it (per position/order). Consequence: both close
branches are verifiable on one demo account **only if** its mode can be
switched in the UI with no open positions. Otherwise each branch needs its own
account state. Open question for the account holder, not the docs.

## Open questions (demo-gated — nothing below is inferred)

1. `posSide` omitted in hedge mode → reject (fail-closed, as documented) or
   accept with a default? Method: one demo place without `posSide`, cancel or
   flatten immediately after reading the answer.
2. `clientOid` resubmitted → rejected as duplicate, or second order? Method:
   docs are silent; probe on demo with a far-from-market limit, cancel after.
   Until answered: no write retries anywhere.
3. One-way `holdMode` wire literal — settled as Documented: the order-info
   response schema lists `holdMode` as `one_way_mode / hedge_mode`
   (verified against the live vendor page 2026-10-04). What stays open is
   only wire observation of `one_way_mode` on a real one-way account; the
   store sets nothing it has not observed either way.
4. Demo funding and fee behaviour — read, not assumed, on first demo contact.
5. `modify-order` `autoCancel: yes` semantics under failure — read the page
   again at implementation time; the tail was cut in transcription.
6. Modify `qty` is assumed to be the new absolute quantity (replace), not a
   delta: `tradeService` re-sends the live amount even on price-only intents,
   which is a no-op under replace semantics and an inflation under delta
   semantics. Unresolvable from docs — probe on funded (modify qty to a known
   value, read back via `order-info`, compare) before trusting any modify.

## Links

- BUG-0597 — the item this unblocks; `area: exchange`, P0
- BUG-0596 — supplies `holdMode` through the positions lane
- `14_uta_v3.md` — the read half of the same generation

---

**For:** Cachy App - Trade Execution Integration
**File:** `docs/bitget-api/15_uta_writes.md`
