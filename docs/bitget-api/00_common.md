# Classic Account

Source: <https://www.bitget.com/legacy-docs/classic/intro>
Crawled on: 2026-09-28

> **Recommended: Use Unified Trading Account.** Bitget's own words, from the
> page above: *"The Classic Account is in maintenance mode and receives only
> essential updates."* Cachy speaks Classic, so Classic is what this reference
> documents — but a reader weighing a migration should know the vendor is
> steering new work toward UTA. See `09_v1_vs_v2.md`.

## Overview

Bitget's developer documentation is served from one site under two account
families. Both are live; they are not compatible with each other.

- **Classic** — documented here. Cachy talks to this one.
- **UTA** (Unified Trading Account) — Bitget's recommended family, on
  `/api/v3/*`. Consolidates spot, margin and derivatives into one account.
  Pointers only; no mirror.

Bitget notes that a Classic account requires holding assets in separate
sub-accounts: **fiat**, **spot**, **margin** and **futures**. UTA exists to
remove exactly that split.

### API introduction

Bitget states that this documentation *"is the only official document of Bitget
API"* and that additions, updates and deprecations are announced in advance.
Deprecations are announced, not versioned: the V1 mix API was retired by notice,
which is why `/api/mix/v1/*` paths are documented nowhere but still appear in
shipped vendor SDKs. `09_v1_vs_v2.md` covers that.

Support channel: [Telegram](https://t.me/bitgetOpenapi). Machine-readable
notices: `Get All Notices` under the Common section.

## Supported products

- Spot
- Margin
- USDT-M perpetual
- USDC-M perpetual
- Coin-M perpetual

This reference covers the Futures (mix) product lines only.

## API domain

| | |
|---|---|
| REST | `https://api.bitget.com` |
| WebSocket (public) | `wss://ws.bitget.com/v2/ws/public` |
| WebSocket (private) | `wss://ws.bitget.com/v2/ws/private` |

There is no separate testnet domain in the Classic documentation. Bitget's demo
trading environment has its own section, and one Futures endpoint
(`Get Historical Transaction Details`) explicitly refuses demo-trading keys.

### `productType`

The product-line selector on almost every Futures endpoint. In V2 it is
**uppercase and hyphenated** — `USDT-FUTURES`, `COIN-FUTURES`,
`USDC-FUTURES`. The lowercase `umcbl` form belongs to the dead V1 API and
carries the same meaning; see `09_v1_vs_v2.md`.

### `symbol`

V2 uses the bare pair: `BTCUSDT`, `ETHUSDT`. No product suffix. V1 required
`_UMCBL`, which Cachy used to append in
[`src/utils/symbolUtils.ts`](../../src/utils/symbolUtils.ts) — it now strips the
suffix instead, so the same normalized symbol serves as both the store key and
the wire symbol. See `09_v1_vs_v2.md`.

Coin-M **delivery** futures use a different format entirely — pair plus month
code plus year, e.g. `BTCUSDH23` (March 2023). Month codes: `F` January, `G`
February, `H` March, `J` April, `K` May, `M` June, `N` July, `Q` August, `U`
September, `V` October, `X` November, `Z` December. Perpetual Coin-M contracts do
not use this format.

## Interface types

### Public interface

No authentication. Market data, contract configuration, funding rates, and the
VIP fee table. Rate limits are counted **per IP**.

One exception inside the Market group: `Get Mark/Index/Market Prices`
(`/api/v2/mix/market/symbol-price`) is **signed**, and its limit is counted per
user rather than per IP. It is grouped with public endpoints in Bitget's own
navigation.

### Private interface

Requires `ACCESS-KEY`, `ACCESS-SIGN`, `ACCESS-TIMESTAMP` and
`ACCESS-PASSPHRASE`. Rate limits are counted **per UID**, and on the private
side they scale with the account's VIP level (see `Rate limits` below).

Because the counters differ, a nominal "10/s" on a public path and on a private
path are not the same budget.

## Margin and position modes

### Margin modes

- Isolated margin
- Cross margin

On the wire the value is `isolated` or `crossed` — note **`crossed`**, not
`cross`. Cachy normalises this to its own internal `cross` vocabulary in
`src/services/exchange/bitgetCapabilities.ts`; the two spellings meeting in one
codebase is a recurring source of confusion.

### Position modes

- One-way mode
- Hedging mode — supports different leverage for long and short positions

This is the single most consequential concept in the Futures API, because the
order schema changes shape with it.

> ## ⚠️ `side` means different things in one-way and hedge mode
>
> From the Classic introduction, verbatim:
>
> | Position mode | Parameters | Operation |
> |---|---|---|
> | One-way | `side: buy` | Buying |
> | One-way | `side: sell` | Selling |
> | Hedge | `side: buy; tradeSide: open` | Opening a long position |
> | Hedge | `side: sell; tradeSide: open` | Opening a short position |
> | Hedge | `side: buy; tradeSide: close` | **Closing a long position** |
> | Hedge | `side: sell; tradeSide: close` | **Closing a short position** |
>
> In one-way mode `side` is the transaction direction and `tradeSide` is
> ignored. In hedge mode `side` is the **position direction** and `tradeSide`
> carries open-versus-close. The same `side: buy` opens a long in one account and
> closes a long in another.
>
> Cachy currently maps a Bitunix-shaped `reduceOnly` + buy/sell onto a single
> `side` value (`src/utils/exchange/bitgetBodies.ts:42`), which is correct for
> the V1 encoding and **inverted** under V2. See `09_v1_vs_v2.md`.

### HODL mode and auto-margin

- Manual borrowing and repayment
- Cross and isolated modes

The auto-margin toggle is `POST /api/v2/mix/account/set-auto-margin`, isolated
positions only.

## Risk management and liquidation

> Triggered when mark price hits liquidation threshold.

Liquidation is driven by the **mark price**, not the last price. This is why the
V2 ticker carries `markPrice` and `indexPrice` alongside `lastPr`, and why
`GET /api/v2/mix/market/symbol-price` exists as a separate call. Cachy parses
`markPrice` defensively for exactly this reason (BUG-0512) and reads
`liquidationPrice` from the position response.

`GET /api/v2/mix/account/liq-price` computes a liquidation price for a
hypothetical position without placing anything — the cheapest way to check
before opening.

## Query conventions

### Pagination and time ranges

Query interfaces support cursor pagination via `idLessThan` and `limit`, and
most also accept `startTime` and `endTime`.

Bitget states a **query priority order**: `id` > `startTime` + `endTime` >
`idLessThan`. Precise filtering by `id` wins; the time range narrows; the cursor
is the fallback for walking back through a window.

> `idLessThan` and `endId` are different fields and are not interchangeable.
> Several doc pages describe `idLessThan` as "the endId", which is wrong — see
> `08_error_codes.md`.

### Retention windows

Windows are endpoint-specific and undocumented in one place, so read them per
endpoint. Known values: `fills-history` 90 days, `orders-history` 90 days,
`fill-history` **1 week**, `order/fills` 3 months, plan orders 3 months,
`bill` 30 days per query / 90-day window, `market/fills-history` 90 days,
`market/candles` 90 days.

Candle granularity retention: `1m`/`3m`/`5m` one month, `15m` 52 days, `30m` 62
days, `1H` 83 days, `2H` 120 days, `4H` 240 days, `6H` 360 days.

## Market depth tiers

Both Spot and Futures use the tiers `1 / 5 / 15 / 50 / max`, default `100`, where
`max` resolves to the highest tier available for the pair.

## Unified futures order types

Trigger orders and trailing stop-losses are one system, discriminated by
`planType`. The fields that drive them:

- `callbackRatio` — the order-triggering percentage for a trailing stop
- `stopSurplusTriggerPrice` — take-profit trigger
- `stopLossTriggerPrice` — stop-loss trigger

Full detail in `06_tp_sl.md`. Cachy wires none of this; see
`INTEGRATION_STATUS.md`.

## Response envelope

Every REST response carries the same four top-level fields:

```json
{ "code": "00000", "msg": "success", "requestTime": 1695806875837, "data": {} }
```

| Field | Description |
|---|---|
| `code` | `"00000"` on success, otherwise a Bitget error code |
| `msg` | Human-readable message; not machine-stable |
| `requestTime` | Venue-side epoch milliseconds |
| `data` | Payload, or `null` on failure |

**A business failure arrives as HTTP `200` with a non-zero `code`.** Any client
that branches on the HTTP status alone will read a rejected order placement as
a success. Bitget also reports some errors as non-2xx *with* a `code` body, so
the safe reading is: check `code === "00000"` when `data` matters, and treat
non-2xx as failure regardless.

## HTTP status codes

- `200` – success, including business errors (read `code`)
- `400` – bad request; also where the decommissioned V1 API answers
- `401` – unauthorized, invalid API key
- `403` – forbidden
- `404` – not found
- `429` – rate limited
- `500` – internal server error

## Rate limits

Two independent layers, and confusing them is the easiest way to be throttled
by a limit you never read.

### Per-endpoint limits

Each endpoint page prints its own limit, scoped either to **IP** (mostly public
market data) or to **UID** (everything private). Verbatim examples:

- `POST /api/v2/mix/order/place-order` — `Rate limit: 10 requests/second/UID`
- `POST /api/v2/mix/order/close-positions` — `Frequency limit: 1 time/1s (User ID)`
- `GET /api/v2/mix/market/contracts` — `Rate Limit: 20 req/sec/IP`

The formatting is inconsistent in the source docs (full-width colons, mixed
capitalisation, singular/plural drift). Quotes are preserved as printed; see
`08_error_codes.md`.

Note that `close-positions` — the endpoint the whole bulk-close question in
BUG-0514 turns on — is limited to **one request per second**, the tightest limit
in the Futures surface. Cachy works around this today by looping client-side,
which is the wrong reason but happens to be the right one.

### Global VIP rate limits

Source: <https://www.bitget.com/legacy-docs/classic/rate-limit/>

| Level | Classic Futures |
|---|---|
| Default | 10/s |
| VIP 1 | 60/s |
| VIP 2 | 80/s |
| VIP 3 | 100/s |
| VIP 4 | 100/s |
| VIP 5 | 100/s |
| VIP 6 | 100/s |
| VIP 7 | 100/s |

Bitget: *"Rate limits are dynamically adjusted based on the user's current VIP
level."* The per-endpoint numbers are therefore floors for a default account,
not ceilings. A client tuned to the documented figure leaves 6–10× throughput on
the table for a VIP account, and a client that assumes VIP headroom will be
throttled on a default account.

Cachy's client rate limiter is set to 20 req/s for Bitget
(`src/services/api/requestManager.ts:62`), which sits above the documented 10/s
default and below the VIP tiers. Note the limiter counts Cachy-level requests,
not per-endpoint venue limits, so a burst of order placements is bounded by
neither number.

## Earn products and crypto loans

Bitget's Classic surface also covers Savings and Shark Fin (Earn) and the
crypto-loan lifecycle. Both are outside the Futures trading surface and neither
is in scope here; they are noted so a reader scanning the sidebar does not
assume this reference is a gap.

---

**For:** Cachy App - Trade Execution Integration
**File:** `docs/bitget-api/00_common.md`
