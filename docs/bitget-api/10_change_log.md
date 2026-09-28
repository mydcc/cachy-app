# Upstream changelog (crawl log)

Source: <https://www.bitget.com/legacy-docs/classic/changelog>
Crawled on: 2026-09-28

Upstream crawl log, frozen at the crawl date. Cachy-side amendments live in
`INTEGRATION_STATUS.md`, not here.

Filtered to entries that touch the Classic **Futures** surface this reference
documents. Broker, spot, margin, tax, earn and copy-trading entries are omitted.

## Reading this log

Two things it is good for.

**Resolving contradictions.** The endpoint pages are inconsistent in places
where the changelog explains why — the docs describe behaviour Bitget has since
changed without the pages being updated. Where a group file flags a
self-contradiction, check here first.

**Knowing that a limit moved.** Rate limits and default query windows are not
stable, and several changed inside the last year.

## Update notice

### 2026-08-18 — VIP rate limits increased for VIP 1–7

- VIP 1: 30/s → **60/s**
- VIP 2: 40/s → **80/s**
- VIP 3–7: 50/s → **100/s**

Applies to Classic Spot and Futures. The per-endpoint limits in this reference
are the Default-tier figures; the VIP table in `00_common.md` is the one that
scales. A client sized to 10/s leaves headroom unused on a VIP account.

### 2026-07-29 — VIP rate limit rules added

New document describing rate limits by VIP level. Basis for the table in
`00_common.md`.

### 2026-08-04 — `fills-history` default query window narrowed to 7 days

Endpoints: `/api/v2/spot/market/fills-history`,
`/api/v2/mix/market/fills-history`.

When `startTime` and `endTime` are absent, the default window changed from
**90 days to 7 days**. Bitget asked integrations to update before 2026-08-04.

Retention is still 90 days; only the implicit window changed. A client that
relied on the old default now silently receives a week, not a quarter.

### 2026-07-21 / 2026-07-23 — `cashDividend` added to positions

Endpoints: `single-position`, `all-position`, `history-position`, and the V2
WebSocket `positions` channel. String, unit USDT.

### 2026-01-07 — `books1` push frequency optimised to 10 ms

Previously 20 ms (and, for nine symbols, still 20 ms as of the 2025-08-28
entry). Relevant to any client throttling book updates: the venue will push
faster than a 20 ms assumption.

## Launched

### 2025-11-19 — `isRwa` added to `contracts`

### 2025-11-27 — `liqPrice` added to `orders-history`

### 2025-11-07 — two new Account endpoints

- `/api/v2/mix/account/max-open` — max openable quantity
- `/api/v2/mix/account/liq-price` — estimated liquidation price

Both are in `02_account.md`. `liq-price` is the cheapest way to check a
liquidation price before opening a position, and Cachy does not call it.

### 2025-11-08 — WebSocket `equity` channel added

### 2025-10-21 — `isolated-symbols` endpoint added

### 2025-09-11 — union margin endpoints added

- `switch-union-usdt`, `union-convert`, `union-config`, `transfer-limits`
- New WebSocket `account` channel fields: `unionTotalMargin`, `unionAvailable`,
  `unionMm`, `assetMode`
- New `assetMode` on the WebSocket `positions` channel

UTA supersedes all of this with its three account modes; see `00_common.md`.

### 2025-07-31 — ⚠️ place-order close logic changed in hedge mode

The one entry in this log that changes what a close *does*:

> **before:** In hedge mode, if the existing quantity is equal to the limit
> close order of the position, a newly added market close order will report an
> error due to insufficient position and will not automatically cancel the limit
> order that has occupied the position.
>
> **after:** …a newly added market close order will **automatically cancel the
> limit order** that has occupied the position (consistent with Web/APP).

This settles a two-way contradiction on the `place-order` page, where one
paragraph still describes the removed error behaviour. See
`08_error_codes.md`.

Consequence for a UI: a market close may now cancel a resting limit order as a
side effect.

### 2025-07-29 — ADL rank: `adlRank` deprecated in favour of `rank`

New field `rank`; old field `adlRank` deprecated. Note `05_position.md` records
that the docs never state the two are equivalent, and the example values
(`0.2248` vs `0.7752`) are not complementary — so a migration between them is
not documented.

### 2025-07-16 — account mode switching API (spot)

### 2025-07-14 — three Futures changes

- `set-leverage` supports **separate long/short leverage ratios**
- `place-pos-tpsl` supports **separate custom IDs** for TP and SL orders
- `history-position` gained a `posMode` field, with values `one_way_mode` and
  `hedge_mode`

That last one matters: it is a documented way to **read the account's position
mode**, which Cachy currently does not do — see `INTEGRATION_STATUS.md`.

### 2025-07-08 — WebSocket `positions` channel gained mark price

### 2025-07-01 — WebSocket place-order and cancel-order channels added

These are the `op:"trade"` **request** channels in `07_websocket_private.md`.
They let a client place and cancel over the socket instead of REST. Cachy does
not use them.

### 2025-06-09 — `contracts` gained `maxMarketOrderQty` and `maxOrderQty`

Both are read by Cachy at
[`src/types/apiSchemas.ts:143`](../../src/types/apiSchemas.ts) — the one V2 call it already makes.

### 2025-05-19 — ⚠️ weekly backend release window

Fixed schedule: **Tuesdays, Wednesdays, Thursdays, 14:00–17:00 UTC+8**, except
emergency releases. During the window:

- REST may return `45001`, `40725` or `40808` — retryable
- **WebSocket connections may be disconnected**

### 2025-05-08 — `fill-history` gained `marginCoin`; `candles` gained preset execution prices

- `/api/v2/mix/order/fill-history` gained `marginCoin`
- `/api/v2/mix/order/place-order` gained `presetStopSurplusExecutePrice` and
  `presetStopLossExecutePrice`, completing the native attached-TP/SL set that
  answers BUG-0503

### 2025-05-09 — `current-fund-rate` `symbol` made optional

### 2025-04-21 — error code `40882` deleted

*"You are currently a trader and you cannot switch to the full position mode"*

### 2025-04-09 — ADL ranking interface added

### 2025-03-22 — WebSocket `account` channel gained `crossedRiskRate`, `unrealizedPL`

### 2025-03-11 — `oi-limit` endpoint added

### 2025-02-03 — error code `22067` added

*"Operations are prohibited during ADL processing."*

## Older, still load-bearing

### 2025-01-15 — ⚠️ USDC-M index and mark price now denominated in USDC

Previously USD. Affects index price, mark price and order book prices for
USDC-M perpetual futures. Cachy is USDT-M only, so this does not apply today —
but it is the reason `markPrice` must not be assumed USD-denominated across
product lines.

### 2024-11-22 — ⚠️ WebSocket connection limits and the 24-hour disconnect

- Connection limit: 300 connection requests per IP per 5 min, max 100
  connections per IP
- Subscription limit: 240 subscription requests per hour per connection, max
  1000 channels per connection
- **"Websocket will be forcibly disconnected every 24 hours, please add the
  reconnection mechanism in your code"**
- 30 s `ping` timer, literal `pong` expected, disconnect after 2 min without a
  `ping`
- 10 messages/second ceiling; recommend subscribing to **fewer than 50
  channels** per connection

The 24-hour forced disconnect is a design requirement, not a failure mode.
Cachy's reconnect backoff satisfies it.

### 2024-12-24 — convert endpoint rate limit 10 → 5 req/sec/UID

`/api/v2/convert/trade`. Not a Futures endpoint; listed because it shows the
direction of travel on limits.

### 2024-10-17 — ⚠️ `change24h` recalculated

The field changed from *"price fluctuation from 00:00 in the UTC+8 time zone to
the current time"* to *"price fluctuation over the past 24 hours from the
current time"*, on `mix/market/ticker`, `mix/market/tickers` and the spot
equivalents.

Historical `change24h` values are **not comparable** across this date. Cachy
reads `priceChangePercent` from the same responses — see
`INTEGRATION_STATUS.md`.

### 2024-09-24 — multi-asset mode APIs launched (union margin)

### 2024-08-15 — broad rate limit reduction

30+ copy-trading and spot endpoints moved to 5 req/sec/UID. No Classic Futures
endpoint in this reference was affected, which is itself informative: the
Futures surface has kept its 10/s default.

---

**For:** Cachy App - Trade Execution Integration
**File:** `docs/bitget-api/10_change_log.md`
