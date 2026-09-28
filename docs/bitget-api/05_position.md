# Position

Source: https://www.bitget.com/legacy-docs/classic/contract/position/Get-Query-Position-Lever
Crawled on: 2026-09-28

The Position group of the Bitget **Classic** futures API. It is the smallest group in the Classic futures surface: the leverage-tier configuration for a symbol, live position reads (single and all), the auto-deleveraging (ADL) queue rank, and closed-position history.

Cachy wires none of these; see `INTEGRATION_STATUS.md`.

> **Two structural anomalies, both confirmed on the live pages.** `Get Position Tier` is a *public, IP-scoped* endpoint served from the **market** path `/api/v2/mix/market/query-position-lever`, not the position path — it is the only public endpoint in this group and the only one scoped per IP. `Get Position Adl Rank` lives at `/api/v2/mix/position/adlRank`, the sole **camelCase** path segment anywhere in Classic V2, and its `adlRank` response field is explicitly marked **deprecated** in favour of `rank`.
>
> **Rate-limit formatting is inconsistent here too:** three endpoints use `Rate limit: N requests/sec/UID`, one uses the bare `Frequency limit: 10 times/1s (IP)`, and two print a label-free `Ntimes/S （uid）` with full-width parentheses and a capital `S`.

## Overview

| # | Endpoint | Method | Auth | Rate limit (as printed) |
|---|---|---|---|---|
| 1 | Get Position Tier | GET | public | `Frequency limit: 10 times/1s (IP)` |
| 2 | Get Single Position | GET | private (signed) | `Rate limit: 10 requests/sec/UID` |
| 3 | Get All Positions | GET | private (signed) | `Rate limit: 5 requests/sec/UID` |
| 4 | Get Position Adl Rank | GET | private (signed) | `5times/S （uid）` |
| 5 | Get Historical Position | GET | private (signed) | `20times/S （uid）` |

Only `Get Position Tier` is public (its request example carries no `ACCESS-KEY` / `ACCESS-SIGN` headers). The other four are signed.

---

## Get Position Tier

- Rate limit: `Frequency limit: 10 times/1s (IP)` — **per IP**, the only IP-scoped endpoint in this group
- Auth: `public`

### HTTP Request

`GET /api/v2/mix/market/query-position-lever`

> **Path anomaly.** This is a Position-group endpoint served from the **market** path (`/api/v2/mix/market/…`), not `/api/v2/mix/position/…`. Combined with the absence of auth headers, it behaves like a market-configuration read rather than a position read. The trailing segment is `query-position-lever` — "lever", not "leverage". The docs' own request example also passes `productType=usdt-futures` in lowercase, contrary to the UPPERCASE V2 convention used in the parameter table on the same page.

Get the position gradient configuration of a certain trading pair.

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `productType` | String | Yes | Product type — `USDT-FUTURES` USDT-M, `COIN-FUTURES` Coin-M, `USDC-FUTURES` USDC-M |
| `symbol` | String | Yes | Trading pair |

### Response Fields (key)

`data` is an array of tiers; `keepMarginRate` is the maintenance margin rate that governs forced partial or full liquidation for that position-size band.

| Field | Type | Description |
|---|---|---|
| `symbol` | String | Trading pair name |
| `level` | String | Tier |
| `startUnit` | String | Minimum value |
| `endUnit` | String | Maximum value |
| `leverage` | String | Leverage |
| `keepMarginRate` | String | Maintenance margin rate: the margin amount corresponds to the position quantity tier. When the margin rate of a position is less than the maintenance margin rate, it will trigger a forced partial liquidation or full liquidation |

---

## Get Single Position

- Rate limit: `Rate limit: 10 requests/sec/UID` — per UID
- Auth: `private (signed)`

### HTTP Request

`GET /api/v2/mix/position/single-position`

Returns position information of a single symbol, response including estimated liquidation price.

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `productType` | String | Yes | Product type — `USDT-FUTURES` USDT-M, `COIN-FUTURES` Coin-M, `USDC-FUTURES` USDC-M |
| `symbol` | String | Yes | Trading pair, e.g. BTCUSDT |
| `marginCoin` | String | Yes | Margin coin, capitalized, e.g. USDT |

### Response Fields (key)

`data` is an **array** even though the query is for a single symbol (and, in hedge mode, can return one entry per direction).

| Field | Type | Description |
|---|---|---|
| `symbol` | String | Trading pair name |
| `marginCoin` | String | Margin coin |
| `holdSide` | String | Position direction — `long`: long position, `short`: short position |
| `openDelegateSize` | String | Amount to be filled of the current order (base coin) |
| `marginSize` | String | Margin amount (margin coin) |
| `available` | String | Available amount for positions (base currency) |
| `locked` | String | Frozen amount in the position (base currency) |
| `total` | String | Total amount of all positions (available amount + locked amount) |
| `leverage` | String | Leverage |
| `achievedProfits` | String | Realized PnL (exclude funding fee and transaction fee) |
| `openPriceAvg` | String | Average entry price |
| `marginMode` | String | Margin mode — `isolated`: isolated margin, `crossed`: cross margin |
| `posMode` | String | Position mode — `one_way_mode`: positions in one-way mode, `hedge_mode`: positions in hedge-mode |
| `unrealizedPL` | String | Unrealized PnL |
| `liquidationPrice` | String | Estimated liquidation price. **If the value <= 0, it means the position is at low risk and there is no liquidation price at this time** |
| `keepMarginRate` | String | Tiered maintenance margin rate |
| `markPrice` | String | Mark price |
| `marginRatio` | String | Maintenance margin rate (MMR), 0.1 represents 10% |
| `breakEvenPrice` | String | Position breakeven price |
| `totalFee` | String | Funding fee, the accumulated value of funding fee during the position. The initial value is empty, indicating that no funding fee has been charged yet |
| `deductedFee` | String | Deducted transaction fees: transaction fees deducted during the position |
| `cashDividend` | String | Cash dividend. The unit is USDT |
| `cTime` | String | Creation time, timestamp, milliseconds |
| `uTime` | String | Last updated time, timestamp, milliseconds |
| `assetMode` | String | `single`: single asset mode, `union`: multi-assets mode |
| `autoMargin` | String | Auto Margin — `on`: Auto Margin Call, `off`: No Auto Margin Call |
| `grant` | String | Futures Airdrop Voucher Amount |
| `takeProfit` / `stopLoss` | String | Take profit price / Stop loss price |
| `takeProfitId` / `stopLossId` | String | Take profit order ID / Stop loss order ID |

Direction is reported as **`holdSide`** with values `long`/`short` — this is the position direction, distinct from the `side` field (`buy`/`sell` in hedge mode) used on the order endpoints.

Doc defects:

1. The response example is internally implausible: `"markPrice": "92171"` alongside `"liquidationPrice": "17288450.450983311758416"` and `"openPriceAvg": "88505.233333333333"` on a `short` position. A liquidation price ~187× the mark price is not a value this endpoint would produce. Treat the example as illustrative only.
2. `"deductedFee": "1.5158073"` is **positive**, although the field is described as deducted fees; the sibling Get All Positions page shows the same field as a small positive value too. The sign convention is undocumented.

---

## Get All Positions

- Rate limit: `Rate limit: 5 requests/sec/UID` — per UID
- Auth: `private (signed)`

### HTTP Request

`GET /api/v2/mix/position/all-position`

Returns information about all current positions with the given `productType`.

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `productType` | String | Yes | Product type — `USDT-FUTURES` USDT-M, `COIN-FUTURES` Coin-M, `USDC-FUTURES` USDC-M |
| `marginCoin` | String | No | Margin coin, capitalized. e.g. USDT |

`marginCoin` is **optional** here (it is required on Get Single Position) — omitting it returns positions across all margin coins of the product type.

### Response Fields (key)

The element schema is identical to Get Single Position, with the same `liquidationPrice` "<= 0 means low risk" caveat and the same `holdSide` direction field.

| Field | Type | Description |
|---|---|---|
| `symbol` | String | Trading pair name |
| `marginCoin` | String | Margin coin |
| `holdSide` | String | Position direction — `long`: long position, `short`: short position |
| `openDelegateSize` | String | Amount to be filled of the current order (base coin) |
| `marginSize` | String | Margin amount (margin coin) |
| `available` | String | Available amount for positions (base currency) |
| `locked` | String | Frozen amount in the position (base currency) |
| `total` | String | Total amount of all positions (available amount + locked amount) |
| `leverage` | String | Leverage |
| `achievedProfits` | String | Realized PnL (exclude funding fee and transaction fee) |
| `openPriceAvg` | String | Average entry price |
| `marginMode` | String | Margin mode — `isolated`: isolated margin, `crossed`: cross margin |
| `posMode` | String | Position mode — `one_way_mode` positions in one-way mode, `hedge_mode` positions in hedge-mode |
| `unrealizedPL` | String | Unrealized PnL |
| `liquidationPrice` | String | Estimated liquidation price. If the value <= 0, it means the position is at low risk and there is no liquidation price at this time |
| `keepMarginRate` | String | Tiered maintenance margin rate |
| `markPrice` | String | Mark price |
| `marginRatio` | String | Maintenance margin rate (MMR), 0.1 represents 10% |
| `breakEvenPrice` | String | Position breakeven price |
| `totalFee` | String | Funding fee, the accumulated value of funding fee during the position. The initial value is empty, indicating that no funding fee has been charged yet |
| `deductedFee` | String | Deducted transaction fees: transaction fees deducted during the position |
| `cashDividend` | String | Cash dividend. The unit is USDT |
| `cTime` | String | Creation time, timestamp, milliseconds. **The set is in descending order from the latest time** |
| `uTime` | String | Last updated time, timestamp, milliseconds |
| `assetMode` | String | `single`: single asset mode, `union`: multi-Assets mode |
| `autoMargin` | String | Auto Margin — `on`: Auto Margin Call, `off`: No Auto Margin Call |
| `grant` | String | Futures Airdrop Voucher Amount |
| `takeProfit` / `stopLoss` | String | Take profit price / Stop loss price |
| `takeProfitId` / `stopLossId` | String | Take profit order ID / Stop loss order ID |

Doc defects:

1. Same implausible sample as Get Single Position: `"markPrice": "93203.4"` with `"liquidationPrice": "5737867.8639926850760812"` on a `short` — a liquidation price above the mark price is impossible for a short.
2. The field order in the response table differs from the response example (e.g. `deductedFee` is documented after the TP/SL fields but appears before them in the JSON). Harmless, but it means the table is not a reliable index into the payload.
3. Unlike Get Single Position, this page's response table does **not** document `openDelegateSize`'s position in the ordering of `total` etc. consistently — no functional impact, but it is another sign the two pages were edited independently.

---

## Get Position Adl Rank

- Rate limit: `5times/S （uid）` — per UID *(no label at all before the value; full-width parentheses `（）`, capital `S`, no space before the parens — transcribed exactly as printed)*
- Auth: `private (signed)`

### HTTP Request

`GET /api/v2/mix/position/adlRank`

> **Path anomaly.** `adlRank` is **camelCase** — the only camelCase path segment in Classic V2; every other path in this API is lowercase-hyphenated or lowercase-concatenated. It sits under `/api/v2/mix/position/`, so unlike Get Position Tier the path is at least in the expected group.

Query Account Position ADL Rank.

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `productType` | String | Yes | Product type, **default: `USDT-FUTURES`** — `USDT-FUTURES` USDT-M, `COIN-FUTURES` Coin-M, `USDC-FUTURES` USDC-M |

Doc defect: the parameter is marked **Required: Yes** while its own description says it has a `default` of `USDT-FUTURES`. A field with a default is not required; the two statements contradict each other.

### Response Fields (key)

| Field | Type | Description |
|---|---|---|
| `symbol` | String | Trading pair |
| `marginCoin` | String | Margin coin |
| `adlRank` *(Deprecated)* | String | This indicator shows your position in the ADL queue. The further ahead you are in the queue, the higher the possibility that your position may be reduced in the event of an auto-deleveraging |
| `rank` | String | Current position's ADL sequence rank. Closer to 1, more prone to ADL during market events |
| `holdSide` | String | Position direction — long: long position, short: short position |

> **Deprecation.** The Bitget page marks **`adlRank` as deprecated**. Use **`rank`** instead. The response example still returns both, with `adlRank: "0.2248"` and `rank: "0.7752"`. Note that the two are *not* documented as a redundant pair with identical meaning — the deprecated field is described as queue *position* and the replacement as an ADL *sequence rank*, and the example values are not complementary, so their exact relationship is not stated.

---

## Get Historical Position

- Rate limit: `20times/S （uid）` — per UID *(no label before the value; full-width parentheses `（）`, capital `S` — transcribed exactly as printed)*
- Auth: `private (signed)`

### HTTP Request

`GET /api/v2/mix/position/history-position`

Check position history — **only the data within 3 months**.

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `symbol` | String | No | Trading pair |
| `productType` | String | No | Product type, **default: `USDT-FUTURES`**; if the `symbol` parameter is requested, this parameter will not take effect. `USDT-FUTURES` USDT-M, `COIN-FUTURES` Coin-M, `USDC-FUTURES` USDC-M |
| `idLessThan` | String | No | Request content on the page before this ID (older data); the value should be the `endId` of the corresponding interface |
| `startTime` | String | No | Start time (timestamp in milliseconds). Unix time in milliseconds, e.g. `1597026383085`. Widest time range is 3 months; if this field is empty the default time range is 3 months |
| `endTime` | String | No | Start time (timestamp in milliseconds) — **see defect**. Unix time in milliseconds, e.g. `1597026383085`. Widest time range is 3 months; if this field is empty the default time range is 3 months |
| `limit` | String | No | Default 20, max 100 |

Every parameter is optional on this endpoint; the window is capped at 3 months regardless.

### Response Fields (key)

`data` is an object with a `list` array plus an `endId` cursor.

| Field | Type | Description |
|---|---|---|
| `list` | Array | Historical Position Data |
| `list[].positionId` | String | History position ID |
| `list[].symbol` | String | Trading pair |
| `list[].marginCoin` | String | Margin coin |
| `list[].holdSide` | String | Position direction — long: long position, short: short position |
| `list[].posMode` | String | Position mode — `one_way_mode`: positions in one-way mode, `hedge_mode`: positions in hedge-mode |
| `list[].openAvgPrice` | String | Average price of opening position |
| `list[].closeAvgPrice` | String | Average price of closing position |
| `list[].marginMode` | String | Margin Mode — `isolated`: Isolated margin, `crossed`: Cross margin |
| `list[].openTotalPos` | String | Accumulated amount of long positions — **see defect** |
| `list[].closeTotalPos` | String | Accumulated amount of short positions — **see defect** |
| `list[].pnl` | String | realized profit and loss |
| `list[].netProfit` | String | net profit — `netProfit = pnl + totalFunding + openFee + closeFee` |
| `list[].totalFunding` | String | Accumulated funding costs |
| `list[].openFee` | String | Total handling fee for position opening |
| `list[].closeFee` | String | Total handling fee for position closing |
| `list[].cashDividend` | String | Cash dividend. The unit is USDT |
| `list[].utime` | String | Last update time, timestamp milliseconds |
| `list[].ctime` | String | Create time, timestamp milliseconds |
| `endId` | String | ID of the last data. The `id` value is a tracking number and is used to page backwards with `idLessThan` |

The documented identity is `netProfit = pnl + totalFunding + openFee + closeFee`. That identity is dimensionally wrong as printed: `pnl`, `totalFunding`, `netProfit` and `cashDividend` are in margin currency (USDT) while `openFee` and `closeFee` are in base currency (contracts/coin). Summing them directly requires an exchange rate. The example compounds this — `pnl: "14.1"`, `netProfit: "12.1"`, `totalFunding: "0.1"`, `openFee: "0.01"`, `closeFee: "0.01"` — which satisfies `12.1 = 14.1 + 0.1 + 0.01 + 0.01` only if `pnl` is treated as a negative contribution. The example's sign convention is not stated.

Doc defects on this page — it is the most error-dense of the five:

1. `endTime` is described as **"Start time (timestamp in milliseconds)"** — a copy-paste of the `startTime` description. It should read *end* time.
2. `openTotalPos` is described as "Accumulated amount of **long** positions" and `closeTotalPos` as "Accumulated amount of **short** positions". That is wrong: the correct reading is that `openTotalPos` is the accumulated amount **opened** and `closeTotalPos` the accumulated amount **closed**. The long/short distinction is carried by `holdSide` on the same record. As printed, the descriptions contradict the example, where `holdSide` is `long` yet `closeTotalPos` is non-zero (`"0.01"`).
3. `productType` says "if symbol parameter **reuqest**" (sic, "reuqest"), and the timestamp note reads "**timestampis** Unix time in milliseconds" (sic, missing space) in both `startTime` and `endTime`.
4. Both time parameters say "**Wildest** time range is 3 months" (sic, "Wildest" for "Widest").
5. The `endId` description terminates its first sentence with a **full-width period** `。` — "ID of the last data。id value is tracking No and use it to check based on idLessThan" — and the remainder is ungrammatical ("tracking No").
6. The response example's `requestTime` is `1312312312321`, an obvious placeholder rather than a real epoch millisecond value.

---

## Cross-cutting observations for this group

- **Direction is `holdSide` with `long`/`short` on all four position endpoints.** There is no `side` field in this group; the `buy`/`sell` direction field belongs to the Trade endpoints, and in hedge mode it means position direction there while `tradeSide` carries `open`/`close`.
- **Margin mode on the wire is `isolated` / `crossed`** (never `cross`), and `marginMode` appears on the single, all, and historical reads but not on the ADL rank read.
- **Position mode is `one_way_mode` / `hedge_mode`**, reported on the single, all, and historical reads. `Get Position Tier` and `Get Position Adl Rank` do not return it.
- **`liquidationPrice` semantics are documented identically on the single and all reads:** a value `<= 0` means the position is at low risk and there is currently no liquidation price. It is *not* returned by the historical read.
- **`Get Historical Position` uses lowercase `ctime` / `utime`**, whereas `Get Single Position` and `Get All Positions` use uppercase `cTime` / `uTime` for the same concept. That casing split is a real wire difference between the live and history reads.
- The stale V1 names `timInForceValue` and the value `normal` do not appear anywhere in this group; all five endpoints are V2 (`/api/v2/…`).

---

**For:** Cachy App - Trade Execution Integration
**File:** `docs/bitget-api/05_position.md`
