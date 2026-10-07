# UTA writes — `/api/v3/trade/*` (order placement, modify, cancel)

Source: <https://www.bitget.com/api-doc/uta/trade/place-order>, which serves the
whole Order Management section (place, modify, cancel, batch, order-info,
unfilled, history, fills). Transcribed 2026-10-04; re-read 2026-10-07.

The per-endpoint `legacy-docs/uta/trade/*` slugs this file originally cited are
gone. Checked 2026-10-07, all 404: `place-order`, `modify-order`, `cancel-order`,
`cancel-symbol-order`, `order-info` — the five trade endpoints in the table
below. The `api-doc/uta/trade/<slug>` path resolves instead, and its page carries
every endpoint in that table **except** `close-positions`, which sits under
Position Management. Those slugs answer 200 but serve the UTA overview rather
than the endpoint spec, so they cannot settle it either — the `close-positions`
row records the same limitation.

Base domain REST: `https://api.bitget.com`. All calls below are signed with the
same HMAC scheme as the reads (`14_uta_v3.md`).

Every claim marked **Documented** is transcribed from a vendor page and was not
observed. Claims marked **Verified** were observed live. Anything else is an
**open question** with the method that settles it — observation on the
trader's account, recorded here, never by inference. Agents never hold keys
and never send requests: there is no agent-executed probe, on demo or live.

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
| modify | `POST /api/v3/trade/modify-order` | orderId\|clientOid + symbol + category + qty and/or price | **Documented**, unverified — `autoCancel` settled, see below |
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

## Modify order — what the page settles

Open question 5 is **answered** (re-read 2026-10-07). Quoting the
`autoCancel` parameter description verbatim:

> Will the original order be canceled if the order modification fails
> yes: Cancel / no: Not cancel (default)
> When set to yes: if the matching engine fails to modify the order, the order
> is cancelled immediately; after cancellation, the counter will reject any
> further modification requests for that order (including in-flight and new
> requests).

So `autoCancel: yes` is not merely "cancel the original on failure" — it also
**permanently burns that order for modification**. Every later request is
refused, in-flight ones included. A client that treats a rejected modify as
retryable and retries with `autoCancel: yes` has its own retry rejected.

`requestId` (number, ≤18 digits) is described as "Returned when `autoCancel=yes`
and the modify order request is rejected", so it is the correlation id for that
rejection. It is a response field, not a request one.

The default is `no`, and `buildBitgetModifyOrderBody` never sends the field
(`bitgetBodies.ts:401`), with a test pinning that
(`bitgetUtaModify.test.ts:128`). That choice was made before the page was
re-readable and is now backed by the vendor text rather than by caution alone.

Two further constraints on this endpoint, both new to this file:

- "Only orders that have not been fully filled can be modified."
- "After submitting a modification request and before receiving the result,
  repeated modification requests cannot be submitted." — modify is serial per
  order. A retry issued before the first resolves will be refused, so the
  refusal above is not the only way to hit this.

Whether `qty` is a replace or a delta is still not stated for this endpoint; see
open question 6.

## Place-order body (UTA)

Required: `category` (`USDT-FUTURES`), `symbol` (bare pair, `BTCUSDT`),
`qty` (base coin for USDT futures), `side` (`buy` | `sell`), `orderType`
(`limit` | `market`). `price` is required for limit, absent for market.
`timeInForce` is **not** required, correcting the earlier transcription of this
file. Re-read 2026-10-07: it carries no *required* marker, and the page states
"When orderType is limit, it defaults to `gtc`; when orderType is market, the
system will execute it as `ioc`". `buildBitgetOrderBody` still sends `gtc`
explicitly on limit orders and omits the field on market ones, which is correct
under either reading — it just no longer rests on the field being mandatory.

The value set has also grown past what this file recorded: `ioc`, `fok`, `gtc`,
plus `post_only` and `rpi`. `rpi` is documented as retail price improvement and
"only available for accounts with RPI market maker permissions".

### Params on the page that this file did not record

`pxAmendType` (`no` | `yes`, default `no`) appears on **both** place and modify:
`no` rejects an order whose price is outside the venue's limit range, `yes` lets
the venue amend the price to the best value inside that range. "Only applicable
to limit orders." Cachy never sends it, so the strict default holds — worth
naming because `yes` would silently move a trader's limit price, which is exactly
the kind of field that must not be set by accident.

`autoBorrow` (`yes` | `no`, default `no`) is spot-only, auto-borrowing to cover a
spot balance shortfall. Not applicable to futures, not sent.

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
trap. Unverified until observed (open question 1): if the venue ever
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
the order of two taker fees on ~$11 notional — cents. Observed 2026-10-04:
there are no demo API keys; only the trader's live account exists, so every
observation is made trader-side during normal trading and recorded here.

## Position mode switching

The UTA API nav lists no set-position-mode / set-margin-mode / set-leverage
endpoint (Classic had all three). The vendor support article says the two
position modes switch *"in the futures settings"* — i.e. app UI, not API.
So the account's `holdMode` is whatever the futures settings say, and the
API only ever *reads* it (per position/order). Consequence: both close
branches are verifiable on one account **only if** its mode can be
switched in the UI with no open positions. Otherwise each branch needs its own
account state. Open question for the account holder, not the docs.

## Open questions (observation-gated — nothing below is inferred)

1. `posSide` omitted in hedge mode → reject (fail-closed, as documented) or
   accept with a default? Method: trader-side observation — one live place
   without `posSide` (far-from-market limit, cancelled or flattened
   immediately after reading the answer), recorded here. No agent sends it.
2. `clientOid` resubmitted → rejected as duplicate, or second order? Method:
   docs are silent; trader-side observation with a far-from-market limit,
   cancelled after. Until answered: no write retries anywhere.
3. One-way `holdMode` wire literal — settled as Documented: the order-info
   response schema lists `holdMode` as `one_way_mode / hedge_mode`
   (verified against the live vendor page 2026-10-04). What stays open is
   only wire observation of `one_way_mode` on a real one-way account; the
   store sets nothing it has not observed either way.
4. Funding and fee behaviour — read from the trader's account, not assumed,
   on first observation.
5. ~~`modify-order` `autoCancel: yes` semantics under failure~~ — **answered
   2026-10-07**, see "Modify order — what the page settles". `yes` cancels the
   original on failure *and* rejects every later modification of that order.
   Cachy already never sends the field.
6. Modify `qty` is assumed to be the new absolute quantity (replace), not a
   delta: `tradeService` re-sends the live amount even on price-only intents,
   which is a no-op under replace semantics and an inflation under delta
   semantics. Re-read 2026-10-07: `modify-order`'s own `qty` description is
   still "Order quantity / Base coin / Either qty or price must be provided" and
   still does not say which. The **batch** endpoint states a constraint that only
   makes sense under replace — "the modified quantity cannot be less than the
   already filled quantity" — which points the same way, but it is a different
   endpoint and a constraint, not a definition. Treated as suggestive, not as
   proof. Still needs observation: modify qty to a known value, read back via
   `order-info`, compare.

## Links

- BUG-0597 — the item this unblocks; `area: exchange`, P0
- BUG-0596 — supplies `holdMode` through the positions lane
- `14_uta_v3.md` — the read half of the same generation

---

**For:** Cachy App - Trade Execution Integration
**File:** `docs/bitget-api/15_uta_writes.md`
