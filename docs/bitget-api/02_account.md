# Account

Source: https://www.bitget.com/legacy-docs/classic/contract/account/Get-Single-Account
Crawled on: 2026-09-28

The Account group of the Bitget **Classic** futures API (V2 `/api/v2/mix/account/*`). It covers balance and equity queries, per-symbol trading capacity estimates, and the account-level settings that must be configured before an order can be placed: leverage, margin mode, position mode, asset mode, isolated auto-margin, and position margin.

Cachy wires none of these; see `INTEGRATION_STATUS.md`.

> **Rate limits are not formatted consistently by Bitget.** Across this group the printed string takes four different shapes — `Frequency limit: N times/1s (uid)`, `Rate limit: N req/sec/UID`, `Rate limits: N time/1s (uid)` and, on the sibling Position group, a bare `5times/S （uid）` with full-width parentheses and no label. Every limit in this group is scoped **per UID**; none of the Account endpoints are IP-scoped. Limits below are transcribed verbatim, typos and all.

## Overview

| # | Endpoint | Method | Auth | Rate limit (as printed) |
|---|---|---|---|---|
| 1 | Get Single Account | GET | private (signed) | `Frequency limit: 10 times/1s (uid)` |
| 2 | Get Account List | GET | private (signed) | `Frequency limit: 10 times/1s (uid)` |
| 3 | Get Subaccount Assets | GET | private (signed) | `Frequency limit: 1 time/10s (uid)` |
| 4 | Get USDT-M futures Interest history | GET | private (signed) | `Frequency limit： 5 times/s (UID)` |
| 5 | Get Max Openable Quantity | GET | private (signed) | `Rate limit: 20 req/sec/UID` |
| 6 | Get Liquidation Price | GET | private (signed) | `Rate limit: 20 req/sec/UID` |
| 7 | My Estimated Open Count | GET | private (signed) | `Frequency limit: 10 times/1s (uid)` |
| 8 | Set Isolated Position Auto Margin | POST | private (signed) | `Frequency limit: 5 times/1s (uid)` |
| 9 | Change Leverage | POST | private (signed) | `Frequency limit: 5 times/1s (uid)` |
| 10 | Change The Product Line Leverage | POST | private (signed) | `Frequency limit: 5 times/1s (uid)` |
| 11 | Adjust Position Margin | POST | private (signed) | `Rate limit: 5 req/sec/UID` |
| 12 | Set USDT-M Futures Asset Mode | POST | private (signed) | `Frequency limit: 2 times/1s (uid)` |
| 13 | Change Margin Mode | POST | private (signed) | `Frequency limit: 5 times/1s (uid)` |
| 14 | Union Convert | POST | private (signed) | `Rate limits: 1 time/1s (uid)` |
| 15 | Change Position Mode | POST | private (signed) | `Frequency limit: 5 times/1s (uid)` |
| 16 | Get Account Bills | GET | private (signed) | `Rate limit: 10 req/sec/UID` |
| 17 | Get Union Transfer Limits | GET | private (signed) | `Rate limits: 1 time/1s (uid)` |
| 18 | Get Union Config | GET | private (signed) | `Rate limits: 1 time/1s (uid)` |
| 19 | Get Switch Union USDT | GET | private (signed) | `Rate limits: 1 time/1s (uid)` |
| 20 | Get Isolated Symbols | GET | private (signed) | `Rate limits: 10 time/1s (uid)` |

All 20 endpoints require the signed-request headers (`ACCESS-KEY`, `ACCESS-SIGN`, `ACCESS-PASSPHRASE`, `ACCESS-TIMESTAMP`); none is a public endpoint.

---

## Get Single Account

- Rate limit: `Frequency limit: 10 times/1s (uid)` — per UID
- Auth: `private (signed)`

### HTTP Request

`GET /api/v2/mix/account/account`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `symbol` | String | Yes | Trading pair |
| `productType` | String | Yes | Product type — `USDT-FUTURES` USDT-M, `COIN-FUTURES` Coin-M, `USDC-FUTURES` USDC-M |
| `marginCoin` | String | Yes | Margin coin |

### Response Fields (key)

| Field | Type | Description |
|---|---|---|
| `marginCoin` | String | Margin coin |
| `available` | String | Available quantity in the account |
| `locked` | String | Locked quantity (margin coin). Lockup is triggered when there is a position to be closed |
| `accountEquity` | String | Account equity (margin coin), incl. unrealized PnL (based on mark price) |
| `usdtEquity` / `btcEquity` | String | Account equity in USDT / BTC |
| `crossedMaxAvailable` / `isolatedMaxAvailable` | String | Max balance to open positions under cross / isolated margin mode |
| `maxTransferOut` | String | Maximum transferable amount |
| `crossedRiskRate` | String | Risk ratio in cross margin mode |
| `crossedMarginLeverage` | String | Leverage in cross margin mode |
| `isolatedLongLever` / `isolatedShortLever` | String | Leverage of long / short positions in isolated margin mode |
| `marginMode` | String | `isolated` or `crossed` |
| `posMode` | String | `one_way_mode` or `hedge_mode` |
| `unrealizedPL`, `crossedUnrealizedPL`, `isolatedUnrealizedPL` | String | Unrealized PnL (total / crossed / isolated) |
| `coupon` | String | Trading bonus |
| `grant` | String | Futures Airdrop Voucher Amount |
| `assetMode` | String | `union` multi-assets / `single` single-assets |
| `isolatedMargin` / `crossedMargin` | String | Isolated / crossed margin occupied |

Doc defects: the response table spells the cross-mode PnL description as `unrealizedPL for croessed` (sic, "croessed" for "crossed") for both `crossedUnrealizedPL` and, in three pages, `isolatedUnrealizedPL`.

---

## Get Account List

- Rate limit: `Frequency limit: 10 times/1s (uid)` — per UID
- Auth: `private (signed)`

### HTTP Request

`GET /api/v2/mix/account/accounts`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `productType` | String | Yes | Product type — `USDT-FUTURES` USDT-M, `COIN-FUTURES` Coin-M, `USDC-FUTURES` USDC-M |

### Response Fields (key)

Same balance/equity shape as Get Single Account, per `marginCoin`, plus the multi-asset (`union`) fields. `data` is an array.

| Field | Type | Description |
|---|---|---|
| `unionTotalMargin` | String | Multi-assets mode total margin |
| `unionAvailable` | String | Available under multi-assets mode |
| `unionMm` | String | Maintenance margin under multi-assets mode |
| `assetList` | List | Assets list under multi-assets mode |
| `assetList[].coin` / `.balance` / `.available` | String | Coin name / balance / max transferable (unit: current coin) |
| `isolatedMargin` / `crossedMargin` | String | Isolated / crossed margin occupied |
| `crossedUnrealizedPL` / `isolatedUnrealizedPL` | String | Unrealized PnL for crossed / isolated |

Doc defects: the response example contains `"unionTotalMargin": "111,1"` — a numeric string with a stray thousands separator. `crossedUnrealizedPL` is again documented as `unrealizedPL for croessed` (sic). `unionTotalMargin` is documented as `Multi-assets multi-assets mode` (duplicated wording).

---

## Get Subaccount Assets

- Rate limit: `Frequency limit: 1 time/10s (uid)` — per UID
- Auth: `private (signed)`

The page states: **ND Brokers are not allowed to call this endpoint**.

### HTTP Request

`GET /api/v2/mix/account/sub-account-assets`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `productType` | String | Yes | Product type — `USDT-FUTURES` USDT-M, `COIN-FUTURES` Coin-M, `USDC-FUTURES` USDC-M |

### Response Fields (key)

`data` is an array of `{ userId, assetList }`; `assetList` entries carry the same per-margin-coin balance shape as Get Account List.

| Field | Type | Description |
|---|---|---|
| `userId` | String | Sub account userId |
| `assetList` | String *(sic — it is an array)* | Collection of all futures assets under sub-accounts |
| `assetList[].marginCoin` | String | Margin coin |
| `assetList[].locked` / `.available` | String | Locked / available quantity |
| `assetList[].maxTransferOut` | String | Maximum transferable amount |
| `assetList[].equity` | String | Account equity (margin coin) — **the response example actually uses `accountEquity`; see defect** |
| `assetList[].usdtEquity` / `.btcEquity` | String | Account equity in USDT / BTC |
| `assetList[].unrealizedPL` | String | PnL of open positions |
| `assetList[].assetMode` | String | `union` / `single` |

Doc defects: the response table names the field `equity` while the response example returns `accountEquity` — the two disagree. `assetList` is typed `String` although it is a list. `crossedUnrealizedPL` is again `unrealizedPL for croessed` (sic). In the response example every field except the numeric strings is `null` (`coupon`, `assetMode`, `grant`, `isolatedMargin`, `crossedMargin`, …) despite being documented as `String`.

---

## Get USDT-M futures Interest history

- Rate limit: `Frequency limit： 5 times/s (UID)` — per UID *(full-width colon `：` and a space after it, as printed)*
- Auth: `private (signed)`

### HTTP Request

`GET /api/v2/mix/account/interest-history`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `coin` | String | No | coin |
| `productType` | String | Yes | Product type — the page lists only `USDT-FUTURES` USDT professional futures |
| `idLessThan` | String | No | Request content on the page before this ID (older data); the value should be the `endId` of the corresponding interface |
| `startTime` | String | Yes | Start timestamp, Unix ms, e.g. `1597026383085` |
| `endTime` | String | Yes | End timestamp, Unix ms, e.g. `1597026383085` |
| `limit` | String | No | Number of queries. Default 20, maximum 100 |

### Response Fields (key)

| Field | Type | Description |
|---|---|---|
| `nextSettleTime` | String | Next interest payment time |
| `borrowAmount` | String | Current USDT-M Futures debt |
| `borrowLimit` | String | Loan limit |
| `interestList` | List\<Object\> *(sic — the page prints a stray trailing backslash)* | interest data |
| `interestList[].coin` | String | Coin |
| `interestList[].liability` | String | Total debt |
| `interestList[].interestFreeLimit` | String | Interest-free amount |
| `interestList[].interestLimit` | String | Interest-accruing amount |
| `interestList[].hourInterestRate` | String | Hourly interest rate |
| `interestList[].interest` | String | interest |
| `interestList[].cTime` | String | create time |
| `endId` | String | Used when `idLessThan` is set as a range |

Doc defects: the `interestList` type is printed as `List<Object\` with a dangling backslash (a markdown-escaping artifact in the source). The curl example on this English page passes `productType=usdt-futures` (lowercase, contrary to the UPPERCASE V2 convention documented everywhere else) and sends `-H "locale:zh-CN"`. The example also shows an `endId` value of the literal string `"xxxxxxxxxxxxxxx"`, a placeholder rather than a real ID.

---

## Get Max Openable Quantity

- Rate limit: `Rate limit: 20 req/sec/UID` — per UID
- Auth: `private (signed)`

### HTTP Request

`GET /api/v2/mix/account/max-open`

The result for the estimated openable quantity **includes** current positions and existing orders (contrast with My Estimated Open Count, which does not).

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `symbol` | String | Yes | Symbol，e.g.: ETHUSDT *(full-width comma, as printed)* |
| `productType` | String | Yes | Product type — `USDT-FUTURES` USDT, `COIN-FUTURES` Coin, `USDC-FUTURES` USDC |
| `marginCoin` | String | Yes | Margin Coin |
| `posSide` | String | Yes | Position side — `long` Long, `short` Short |
| `orderType` | String | Yes | orderType — `limit` Limit order, `market` Market order |
| `openPrice` | String | No | Opening price. Required when `orderType=limit` |

Note the field name is **`posSide`**, not `side`, and its values are `long`/`short` (position direction) — distinct from the `side` field used on order endpoints.

### Response Fields (key)

| Field | Type | Description |
|---|---|---|
| `maxOpen` | String | Max Openable Quantity |

Doc defects: the curl example passes `openAmount=50`, but `openAmount` does not appear in the request parameter table at all — the documented contract and the example disagree on whether the size of the intended position is an input.

---

## Get Liquidation Price

- Rate limit: `Rate limit: 20 req/sec/UID` — per UID
- Auth: `private (signed)`

### HTTP Request

`GET /api/v2/mix/account/liq-price`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `symbol` | String | Yes | Symbol，e.g.: ETHUSDT *(full-width comma, as printed)* |
| `productType` | String | Yes | Product type — `USDT-FUTURES` USDT, `COIN-FUTURES` Coin, `USDC-FUTURES` USDC |
| `marginCoin` | String | Yes | Margin Coin |
| `posSide` | String | Yes | Position side — `long` Long, `short` Short |
| `orderType` | String | Yes | orderType — `limit` Limit order, `market` Market order |
| `openAmount` | String | Yes | Opening amount |
| `openPrice` | String | No | Opening price. Required when `orderType=limit` |

This is the one place in the Account group where `openAmount` **is** a documented parameter — unlike Get Max Openable Quantity, which omits it.

### Response Fields (key)

| Field | Type | Description |
|---|---|---|
| `liqPrice` | String | Liquidation Price |

Doc defects: the response example is `"liqPrice": "-5025939.4855934659933227"` — a **negative** liquidation price, which is not a physically meaningful value. Treat the example as illustrative only.

---

## My Estimated Open Count

- Rate limit: `Frequency limit: 10 times/1s (uid)` — per UID
- Auth: `private (signed)`

### HTTP Request

`GET /api/v2/mix/account/open-count`

The result for the estimated openable quantity **does not** include current positions and existing orders.

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `symbol` | String | Yes | Trading pair, e.g. ETHUSDT |
| `productType` | String | Yes | Product type — `USDT-FUTURES` USDT-M, `COIN-FUTURES` Coin-M, `USDC-FUTURES` USDC-M |
| `marginCoin` | String | Yes | Margin coin |
| `openAmount` | String | Yes | Margin amount |
| `openPrice` | String | Yes | Price of the order |
| `leverage` | String | No | Leverage, default 20 |

### Response Fields (key)

| Field | Type | Description |
|---|---|---|
| `size` | String | Estimated open size |

Despite the page title, the response field is `size` (a base-quantity size), while the request takes `openAmount` as a **margin** amount — the naming does not make the input/output relationship obvious.

---

## Set Isolated Position Auto Margin

- Rate limit: `Frequency limit: 5 times/1s (uid)` — per UID
- Auth: `private (signed)`

### HTTP Request

`POST /api/v2/mix/account/set-auto-margin`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `symbol` | String | Yes | Trading pair |
| `autoMargin` | String | Yes | Auto margin flag — `on` auto margin on, `off` auto margin off |
| `marginCoin` | String | Yes | Margin coin must be capitalized |
| `holdSide` | String | Yes | Position direction (no need in cross margin mode) — `long` long position; `short` short position |

Note the direction field is **`holdSide`** here, with values `long`/`short` — not the `side` field of order endpoints.

### Response Fields (key)

| Field | Type | Description |
|---|---|---|
| `code` | String | `'00000'`: success; others: fail |

---

## Change Leverage

- Rate limit: `Frequency limit: 5 times/1s (uid)` — per UID
- Auth: `private (signed)`

### HTTP Request

`POST /api/v2/mix/account/set-leverage`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `symbol` | String | Yes | Trading pair |
| `productType` | String | Yes | Product type — `USDT-FUTURES` USDT-M, `COIN-FUTURES` Coin-M, `USDC-FUTURES` USDC-M |
| `marginCoin` | String | Yes | Margin coin must be capitalized |
| `leverage` | String | No | Leverage ratio. Applies to cross-margin mode, to one-way position scenarios in isolated margin mode, and to hedge-mode in isolated margin mode when the same ratio applies to both directions |
| `longLeverage` | String | No | Long position leverage. Only for hedge-mode in isolated margin mode with different ratios per direction. In two-way position scenarios, if both `leverage` and `longLeverage` are passed, `longLeverage` wins and `leverage` is ignored |
| `shortLeverage` | String | No | Short position leverage. Only for hedge-mode in isolated margin mode with different ratios per direction. In two-way position scenarios, if both `leverage` and `shortLeverage` are passed, `shortLeverage` wins and `leverage` is ignored |
| `holdSide` | String | No | Position direction — `long` Long position；`short` Short position *(full-width semicolons, as printed)*. Cross margin mode: not needed. Isolated margin mode: not needed for one-way positions; **required** for hedge-mode — and not required when long and short leverage are set simultaneously for hedge-mode |

The page adds: "When adjusting leverage in cross margin mode, please use the `leverage` parameter instead of `longLeverage` or `shortLeverage`. Currently, there is no mandatory validation for `longLeverage` and `shortLeverage`."

### Response Fields (key)

| Field | Type | Description |
|---|---|---|
| `symbol` | String | Trading pair name |
| `marginCoin` | String | Margin coin |
| `longLeverage` | String | Leverage of long positions |
| `shortLeveage` | String | Leverage of short positions — **`shortLeveage` (sic, misspelled in the Bitget docs)** |
| `crossMarginLeverage` | String | Leverage of 'crossed' margin mode |
| `marginMode` | String | Margin mode — `isolated` / `crossed` |

Doc defects: the response table prints the field as **`shortLeveage`** (sic, missing the `r`) while the request table and the response JSON both use `shortLeverage`. The same misspelling recurs in Change Margin Mode's response table. The request example contradicts the guidance: it sends `"holdSide":"long"` together with `leverage`.

---

## Change The Product Line Leverage

- Rate limit: `Frequency limit: 5 times/1s (uid)` — per UID
- Auth: `private (signed)`

### HTTP Request

`POST /api/v2/mix/account/set-all-leverage`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `productType` | String | Yes | Product type — `USDT-FUTURES` USDT-M, `COIN-FUTURES` Coin-M, `USDC-FUTURES` USDC-M |
| `leverage` | String | Yes | Leverage (Only effective for symbols that have opened positions) |

### Response Fields (key)

| Field | Type | Description |
|---|---|---|
| `data` | String | result — `success: sueexeeful` / `failure: failed` *(sic, "sueexeeful" as printed)* |

Doc defects — this page is materially incomplete:

1. The request parameter table lists only `productType` and `leverage`, but the curl example on the same page also sends `symbol`, `marginCoin` and `holdSide`. The documented contract is therefore narrower than the endpoint's own example, and it is not stated which of those three are actually required.
2. The response description contains the garbled `success: sueexeeful` (sic, presumably "successful"), and it says `failure: failed` while the example returns `data: "success"`.
3. The title says "Product Line Leverage" and the path is `set-all-leverage`, but the `leverage` description limits it to "symbols that have opened positions" — the scope implied by the title (whole product line) is not what the description says.

---

## Adjust Position Margin

- Rate limit: `Rate limit: 5 req/sec/UID` — per UID
- Auth: `private (signed)`

### HTTP Request

`POST /api/v2/mix/account/set-margin`

Add or reduce the margin — **only for isolated margin mode**.

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `symbol` | String | Yes | Trading pair |
| `productType` | String | Yes | Product type — `USDT-FUTURES` USDT-M, `COIN-FUTURES` Coin-M, `USDC-FUTURES` USDC-M |
| `marginCoin` | String | Yes | Margin coin must be capitalized |
| `holdSide` | String | Yes | Position direction — `long` long position; `short` short position |
| `amount` | String | Yes | Margin amount, positive means increase, and negative means decrease |

### Response Fields (key)

| Field | Type | Description |
|---|---|---|
| `code` | String | `'00000'`: success; others: fail |

`amount` is signed: a negative value reduces margin. The response example shows `"data": ""` (empty string) on success, not `"success"` as several sibling endpoints return.

---

## Set USDT-M Futures Asset Mode

- Rate limit: `Frequency limit: 2 times/1s (uid)` — per UID
- Auth: `private (signed)`

### HTTP Request

`POST /api/v2/mix/account/set-asset-mode`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `productType` | String | Yes | Product type — the page lists only `USDT-FUTURES` USDT professional futures |
| `assetMode` | String | Yes | Asset mode — `single`: Single asset mode, `union`: Multi-assets mode |

### Response Fields (key)

| Field | Type | Description |
|---|---|---|
| `data` | String | `'success'` mean set the asset mode success |

Doc defect: the `productType` description lists only `USDT-FUTURES` USDT professional futures, whereas every other account endpoint in this group lists all three of `USDT-FUTURES` / `COIN-FUTURES` / `USDC-FUTURES`. Whether the other two product types are accepted here is undocumented.

---

## Change Margin Mode

- Rate limit: `Frequency limit: 5 times/1s (uid)` — per UID
- Auth: `private (signed)`

"This interface cannot be used when the users have an open position or an order."

### HTTP Request

`POST /api/v2/mix/account/set-margin-mode`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `symbol` | String | Yes | Trading pair. e.g. BTCUSDT |
| `productType` | String | Yes | Product type — `USDT-FUTURES` USDT-M, `COIN-FUTURES` Coin-M, `USDC-FUTURES` USDC-M |
| `marginCoin` | String | Yes | Margin coin, must be capitalized |
| `marginMode` | String | Yes | Margin mode — `isolated`: isolated margin mode, `crossed`: crossed margin mode |

The wire value is **`crossed`**, not `cross`.

### Response Fields (key)

| Field | Type | Description |
|---|---|---|
| `symbol` | String | Trading pair name |
| `marginCoin` | String | Margin coin |
| `longLeverage` | String | Leverage of long positions |
| `shortLeveage` | String | Leverage of short positions — **`shortLeveage` (sic, misspelled in the Bitget docs)** |
| `marginMode` | String | Margin mode — `isolated` / `crossed` |

Doc defects: same `shortLeveage` (sic) misspelling as Change Leverage, while the response example on this same page correctly returns `"shortLeverage"`. The page title (Change Margin Mode) and the path (`set-margin-mode`) are consistent, but the request example passes lowercase `"marginCoin": "usdt"` while the parameter description insists it "must be capitalized".

---

## Union Convert

- Rate limit: `Rate limits: 1 time/1s (uid)` — per UID *(note the plural "limits", as printed)*
- Auth: `private (signed)`

### HTTP Request

`POST /api/v2/mix/account/union-convert`

Union margin exchange — converts a coin balance in multi-asset (union) mode into USDT margin.

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `coin` | String | Yes | Coin Name, e.g. BTC |
| `amount` | String | Yes | Exchange Quantity. Unit: Exchange Currency |

### Response Fields (key)

| Field | Type | Description |
|---|---|---|
| `usdtAmount` | String | Exchanged USDT Quantity |

Doc defect: the response parameter table documents only `usdtAmount` and omits `code` / `msg` / `requestTime`, which every other endpoint in this group lists.

---

## Change Position Mode

- Rate limit: `Frequency limit: 5 times/1s (uid)` — per UID
- Auth: `private (signed)`

### HTTP Request

`POST /api/v2/mix/account/set-position-mode`

Adjust the position mode between 'one way mode' and 'hedge mode'. If you want to change the user's position mode on all symbol contracts, you need to specify hedge mode positions or one-way positions.

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `productType` | String | Yes | Product type — `USDT-FUTURES` USDT-M, `COIN-FUTURES` Coin-M, `USDC-FUTURES` USDC-M |
| `posMode` | String | Yes | Position mode — `one_way_mode`: one-way mode, `hedge_mode`: hedge mode |

The wire values are `one_way_mode` / `hedge_mode` (snake_case, not `one-way`).

### Response Fields (key)

| Field | Type | Description |
|---|---|---|
| `posMode` | String | Position mode — `one_way_mode` / `hedge_mode` |

Doc defect: the Description prose is garbled and self-contradicting — it states the mode "can't be adjusted when there is an open position order under the product type", then continues mid-sentence with a second, differently-worded copy of the same restriction ("Changes the user's position mode for all symbol futures: hedging mode or one-way mode.When users hold positions or orders on any side of any trading pair in the specific product type, the request may fail." — note the missing space after the period). The restriction that matters: the request may fail if any symbol in that `productType` holds a position or an order.

---

## Get Account Bills

- Rate limit: `Rate limit: 10 req/sec/UID` — per UID
- Auth: `private (signed)`

"It only supports to get the data within 90days. The older data can be downloaded from web."

### HTTP Request

`GET /api/v2/mix/account/bill`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `productType` | String | Yes | Product type — `USDT-FUTURES` USDT-M, `COIN-FUTURES` Coin-M, `USDC-FUTURES` USDC-M |
| `coin` | String | No | Currency. Valid only when `businessType` is `trans_from_exchange` or `trans_to_exchange` |
| `businessType` | String | No | Business type *(no enumeration given here — see defect; the full enum list appears in the response section)* |
| `onlyFunding` | String | No | The following four types of non-financial `businessType` will be excluded, `default：no` *(full-width colon, as printed)* — `yes`: excluded, `no`: included. The four types are `append_margin`, `adjust_down_lever_append_margin`, `reduce_margin`, `auto_append_margin` |
| `idLessThan` | String | No | Request content on the page before this ID (older data); the value should be the `endId` of the corresponding interface |
| `startTime` | String | No | Start time, ms. The interval between `startTime` and `endTime` should be <= 30 days |
| `endTime` | String | No | End time, ms. The interval between `startTime` and `endTime` should be <= 30 days |
| `limit` | String | No | Page size, max 100, default 20 |

### Response Fields (key)

| Field | Type | Description |
|---|---|---|
| `bills` | Array | Bill list |
| `bills[].billId` | String | Bill ID |
| `bills[].symbol` | String | Symbol |
| `bills[].amount` | String | Amount |
| `bills[].fee` | String | Fee |
| `bills[].feeByCoupon` | String | Fee paid by the coupon |
| `bills[].businessType` | String | Business Type (see enum below) |
| `bills[].coin` | String | Coin: USDT |
| `bills[].balance` | String | Balance |
| `bills[].cTime` | String | Created Time, ms |
| `endId` | String | The final transaction order ID |

`businessType` enumeration as printed: `unknown`, `trans_from_exchange`, `trans_to_exchange`, `open_long`, `open_short`, `close_long`, `close_short`, `force_close_long`, `force_close_short`, `contract_settle_fee`, `append_margin`, `adjust_down_lever_append_margin`, `reduce_margin`, `auto_append_margin`, `cash_gift_issue`, `cash_gift_recycle`, `tracking_follow_pay`, `tracking_follow_back`, `tracking_trader_income`, `burst_long_loss_query`, `burst_short_loss_query`, `trans_from_contract`, `trans_to_contract`, `trans_from_otc`, `trans_to_otc`, `buy`, `sell`, `force_buy`, `force_sell`, `burst_buy`, `burst_sell`, `bonus_issue`, `bonus_recycle`, `bonus_expired`, `delivery_long`, `delivery_short`, `trans_from_cross`, `trans_to_cross`, `trans_from_isolated`, `trans_to_isolated`, `risk_captital_user_transfer` *(sic, "captital")*, `user_exchange_buy`, `user_exchange_sell`, `settle_interest`, `adl_close_long`, `adl_close_short`, `adl_buy_in_single_side_mode`, `adl_sell_in_single_side_mode`.

Note that `buy` / `sell` / `force_buy` / `force_sell` apply in `one_way_mode`, while `open_long` / `close_short` etc. apply in `hedge_mode`.

Doc defects:

1. The request table's `businessType` row has no enumeration at all; the 49-value list is stranded in the Response Parameters section, so the request contract is undocumented where it matters.
2. The `endId` response description says it is used "when idLessThan/**idGreaterThan** is set as a range" — but `idGreaterThan` is not a request parameter of this endpoint.
3. `risk_captital_user_transfer` (sic, presumably "capital").
4. The description reads "within 90days" (no space) and the time-window restriction is stated twice per parameter, in both the `startTime` and `endTime` rows.

---

## Get Union Transfer Limits

- Rate limit: `Rate limits: 1 time/1s (uid)` — per UID *(plural "limits", as printed)*
- Auth: `private (signed)`

### HTTP Request

`GET /api/v2/mix/account/transfer-limits`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `coin` | String | Yes | Coin Name, e.g. BTC |

### Response Fields (key)

| Field | Type | Description |
|---|---|---|
| `coin` | String | Coin Name |
| `maxTransferIn` | String | Maximum Transfer-in Quantity. Unit: coin |

Despite the plural title "Limits", only the transfer-**in** limit is returned; there is no `maxTransferOut` field.

---

## Get Union Config

- Rate limit: `Rate limits: 1 time/1s (uid)` — per UID *(plural "limits", as printed)*
- Auth: `private (signed)`

### HTTP Request

`GET /api/v2/mix/account/union-config`

### Request Parameters

The Request Parameters section prints only `无` — the untranslated Chinese word for "none" (sic). This endpoint takes no parameters.

### Response Fields (key)

| Field | Type | Description |
|---|---|---|
| `imr` | String | Liability Initial Margin Rate. Decimal format. Fixed value: 0.1 |
| `mmr` | String | Liability Maintenance Margin Rate. Decimal format. Fixed value: 0.05 |
| `individualLimit` | String | Personal Liability Limit. Unit: USDT |
| `individualLimitRatio` | String | Personal Liability Limit Ratio. Decimal format, e.g. 0.8 represents 80% |

Doc defect: the Request Parameters heading is filled with the untranslated placeholder `无` instead of an English "None".

---

## Get Switch Union USDT

- Rate limit: `Rate limits: 1 time/1s (uid)` — per UID *(plural "limits", as printed)*
- Auth: `private (signed)`

### HTTP Request

`GET /api/v2/mix/account/switch-union-usdt`

Get USDT quota for switching from union margin to single margin.

### Request Parameters

The Request Parameters section prints only `无` — the untranslated Chinese word for "none" (sic). This endpoint takes no parameters.

### Response Fields (key)

| Field | Type | Description |
|---|---|---|
| `usdtAmount` | String | USDT quota required for account mode switching. Unit: USDT |

Doc defect: the Request Parameters heading is filled with the untranslated placeholder `无` instead of an English "None" — same as Get Union Config.

---

## Get Isolated Symbols

- Rate limit: `Rate limits: 10 time/1s (uid)` — per UID *(plural "limits" **and** singular "time", as printed)*
- Auth: `private (signed)`

### HTTP Request

`GET /api/v2/mix/account/isolated-symbols`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `productType` | String | Yes | Product type — `USDT-FUTURES` USDT-M, `COIN-FUTURES` Coin-M, `USDC-FUTURES` USDC-M |

### Response Fields (key)

`data` is an array.

| Field | Type | Description |
|---|---|---|
| `symbol` | String | Symbol name |
| `marginMode` | String | The margin mode is fixed as `isolated` |

Doc defects:

1. The curl example's host is `https://api/v2/mix/account/isolated-symbols?productType=USDT-FUTURES` — the `api.bitget.com` hostname is missing, so the example URL is not callable as printed.
2. The rate limit reads `Rate limits: 10 time/1s (uid)` — singular "time" where every sibling page uses "times", and plural "limits" where most use singular "limit".
3. The response documents only `symbol` and `marginMode`; because `marginMode` is fixed to `isolated`, the endpoint effectively reports "which symbols are configured for isolated margin".

---

## Cross-cutting observations for this group

- **Rate-limit formatting is inconsistent but the numeric intent is uniform.** Bitget prints the same underlying policy in at least four typographic styles in this group. All 20 limits are per **UID**; no Account endpoint is IP-scoped.
- **Direction fields are not uniform.** `holdSide` (`long`/`short`) on Set Isolated Position Auto Margin, Change Leverage, Change The Product Line Leverage and Adjust Position Margin; `posSide` (`long`/`short`) on Get Max Openable Quantity and Get Liquidation Price. None of these is the order-side `side` field (`buy`/`sell`) used on the Trade endpoints.
- **`marginCoin` capitalization is stated as mandatory** ("must be capitalized", "must be capitalized") on the write endpoints, yet several request examples on those same pages send `"marginCoin":"usdt"` in lowercase. The examples contradict the stated requirement.
- **Two typo'd response field names recur:** `shortLeveage` in the Change Leverage and Change Margin Mode response tables.
- **Three endpoints return no `data` payload of interest** (Set Isolated Position Auto Margin, Adjust Position Margin) or document only `code`, while the rest return structured data.
- The `stale-V1` names `timInForceValue` and the value `normal` do not appear anywhere in this group; the endpoints here are all V2 (`/api/v2/mix/account/*`).

---

**For:** Cachy App - Trade Execution Integration
**File:** `docs/bitget-api/02_account.md`
