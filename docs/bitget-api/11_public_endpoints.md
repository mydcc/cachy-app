# Public and common endpoints

Source: https://www.bitget.com/legacy-docs/classic/common/notice/Get-All-Notices (group root)

Pages transcribed:

- https://www.bitget.com/legacy-docs/classic/common/notice/Get-All-Notices
- https://www.bitget.com/legacy-docs/classic/common/public/Get-Server-Time
- https://www.bitget.com/legacy-docs/classic/common/public/Get-Trade-Rate
- https://www.bitget.com/legacy-docs/classic/common/public/Get-All-Trade-Rate
- https://www.bitget.com/legacy-docs/classic/common/apidata/Whale-Net-Flow
- https://www.bitget.com/legacy-docs/classic/common/account/Funding-Assets
- https://www.bitget.com/legacy-docs/classic/common/vsubaccount/Create-Virtual-Subaccount

Supporting page (signature, timestamp validity):
https://www.bitget.com/legacy-docs/classic/quickStart/intro

Crawled on: 2026-09-28

Cachy calls none of these yet; see `INTEGRATION_STATUS.md`.

The **Common** group holds everything that is not tied to one trading product:
server time, announcements, trading-fee rates, spot flow insight, funding-account
balances and virtual sub-accounts. Most of it is public — the announcement feed,
server time and whale net flow need no API key; the rest are signed. All requests
go to `https://api.bitget.com` (VIP line: `https://vip-api.bitget.com`).

Every endpoint returns the same envelope:

```json
{ "code": "00000", "msg": "success", "requestTime": 1688008631614, "data": {} }
```

`code` is the string `"00000"` on success; any other value is an error code (see
`09_error_codes.md`). `requestTime` is a JSON **number** in Unix milliseconds,
while most values inside `data` are JSON **strings** — including every timestamp
field. Rate limits are per IP for public endpoints and per UID for signed ones,
with an overall ceiling of 6000 requests/IP/minute; exceeding a limit returns
HTTP 429.

## Overview

| # | Endpoint | Method | Auth | Rate limit (as printed) |
|---|---|---|---|---|
| 1 | Query Announcements | `GET /api/v2/public/annoucements` | `public` | `Frequency limit: 20 times/1s (IP)` |
| 2 | Get Server Time | `GET /api/v2/public/time` | `public` | `Frequency limit: 20 times/1s (IP)` |
| 3 | Get Trade Rate | `GET /api/v2/common/trade-rate` | `private (signed)` | `Frequency limit:10 times/1s (UID)` |
| 4 | Get Business Line All Symbol Trade Rate | `GET /api/v2/common/all-trade-rate` | `private (signed)` | `Frequency limit:10 times/1s (UID)` |
| 5 | Get Spot Whale Net Flow Data | `GET /api/v2/spot/market/whale-net-flow` | `public` | `Rate limit: 1 req/s (IP)` |
| 6 | Funding Assets | `GET /api/v2/account/funding-assets` | `private (signed)` | `Frequency limit: 10 times/1s (User ID)` |
| 7 | Create Virtual Subaccount | `POST /api/v2/user/create-virtual-subaccount` | `private (signed)` | `Frequency limit: 5 times/1s (User ID)` |

> **Doc note —** The sidebar files #3 and #4 under a group literally labelled
> "Public Info", yet both request examples carry the full signed header set and
> both rate limits are scoped per UID. They are signed; the group label is wrong.

## Query Announcements

- Rate limit: `Frequency limit: 20 times/1s (IP)`
- Auth: `public`

### HTTP Request

`GET /api/v2/public/annoucements`

> **Doc note —** The path is misspelled by the vendor as `annoucements`
> (missing the `n`). This is not a typo in these notes: the live API uses the
> same misspelling, so it must be requested verbatim.

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `annType` | String | No | Announcement type — see values below |
| `startTime` | String | No | Query start, Unix millisecond timestamp, e.g. `1690196141868` |
| `endTime` | String | No | Query end, Unix millisecond timestamp, e.g. `1690196141868` |
| `cursor` | String | No | Cursor ID. Omit on the first call; thereafter pass the last `annId` of the previous response |
| `limit` | String | No | Entries per page. Default 10, **maximum 10** |
| `language` | String | Yes | `zh_CN` (Chinese) or `en_US` (English). Falls back to English if the requested language is unsupported |

`annType` values, with the sub-types the docs define for each:

| `annType` | Documented sub-types |
|---|---|
| `latest_news` | `announcements` (latest announcement), `news` (Bitget news) |
| `coin_listings` | `spot`, `futures`, `margin`, `copy_trading` |
| `product_updates` | `spot`, `futures`, `margin`, `copy_trading` |
| `security` | `security_information` |
| `api_trading` | `api_announcement` |
| `symbol_delisting` | `trading_pair_delisting` |
| `maintenance_system_updates` | `asset_maintenance`, `system_updates`, `spot_maintenance`, `futures_maintenance` |

### Response Parameters

| Parameter | Type | Description |
|---|---|---|
| `annId` | String | Announcement ID (also the `cursor` value for the next page) |
| `annTitle` | String | Announcement title |
| `annDesc` | String | Announcement description — **deprecated** by the vendor |
| `language` | String | Language type |
| `annUrl` | String | Announcement URL |
| `annType` | String | Announcement type |
| `annSubType` | String | Announcement sub-type |
| `cTime` | String | Release time, Unix millisecond timestamp |

> **This is how Bitget announces deprecations.** The decommissioning of the V1
> mix API was announced through this feed; the concrete entries are recorded in
> `10_change_log.md`. A client integrating against Bitget should poll this
> endpoint, or check it periodically, because nothing in the API itself signals a
> deprecation: the envelope carries only `code`/`msg`/`requestTime`/`data`, the
> signature headers (`ACCESS-KEY`, `ACCESS-SIGN`, `ACCESS-TIMESTAMP`,
> `ACCESS-PASSPHRASE`, `Content-Type`, `locale`) carry no version or sunset
> field, and no response header is documented for it. Filter on
> `annType=api_trading` for API-specific notices. Note the practical limits of
> the pagination — `limit` maxes out at 10 per call, the search window is one
> month, and `annDesc` is deprecated, so the title, type and URL are what remain
> usable.

> **Doc note —** The page description orders `annType` as
> `… security, api_trading, symbol_delisting, maintenance_system_updates`, while
> the request-parameter table orders the last two the other way round. Same set
> of seven values either way.

## Get Server Time

- Rate limit: `Frequency limit: 20 times/1s (IP)`
- Auth: `public`

### HTTP Request

`GET /api/v2/public/time`

### Request Parameters

None. The docs' parameter table reads `N/A`.

### Response Parameters

| Parameter | Type | Description |
|---|---|---|
| `serverTime` | String | Server time, Unix millisecond timestamp, e.g. `1690196141868` |

> **This is the clock-drift endpoint.** The REST signature is built over
> `ACCESS-TIMESTAMP`, a millisecond timestamp, and Bitget's standard
> specification fixes its validity: the request timestamp must be within **30
> seconds** of API server time or the request is treated as expired and
> rejected. The documented signature carries **no `recvWindow`**, so a client
> whose clock is off by more than 30 s has no way to negotiate its way back in —
> the only recovery is to read server time here and correct the local clock
> before signing. Two traps: `serverTime` is returned as a **String**, not a
> number, and it is the same clock that stamped the `requestTime` field beside
> it — which *is* a number. The two are not interchangeable in the raw JSON.

## Get Trade Rate

- Rate limit: `Frequency limit:10 times/1s (UID)`
- Auth: `private (signed)`

> **Doc note —** The rate limit is printed with no space after the colon
> (`Frequency limit:10 …`), unlike the sibling pages. Reproduced as printed.

### HTTP Request

`GET /api/v2/common/trade-rate`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `symbol` | String | Yes | Trading pair name, e.g. `BTCUSDT` |
| `businessType` | String | Yes | `mix` (contract), `spot` (spot), `margin` (leverage) |

### Response Parameters

| Parameter | Type | Description |
|---|---|---|
| `makerFeeRate` | String | Maker fee rate, fractional form |
| `takerFeeRate` | String | Taker fee rate, fractional form |

> **Doc note —** Both field descriptions read "Fractional form, i.e., 0.0002 for
> two parts per million", which is arithmetically wrong: 0.0002 is two parts per
> ten thousand (0.02 %), not per million. The `makerFeeRate` description is also
> labelled "Pending Order Handling Rates" in both endpoints — the same
> mistranslation appears for the maker rate here and below.

## Get Business Line All Symbol Trade Rate

- Rate limit: `Frequency limit:10 times/1s (UID)`
- Auth: `private (signed)`

> **Doc note —** The rate limit is printed with no space after the colon
> (`Frequency limit:10 …`). Reproduced as printed.

### HTTP Request

`GET /api/v2/common/all-trade-rate`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `businessType` | String | Yes | `mix` (contract), `spot` (spot), `margin` (leverage) |

### Response Parameters

Returns an array of objects, one per symbol.

| Parameter | Type | Description |
|---|---|---|
| `symbol` | String | Trading pair |
| `makerFeeRate` | String | Maker fee rate, fractional form |
| `takerFeeRate` | String | Taker fee rate, fractional form |

> **Doc note —** The page's Description section says only "Get Trade Rate", the
> title of the preceding endpoint. No pagination, no total count and no
> documented cap on the returned array size.

## Get Spot Whale Net Flow Data

- Rate limit: `Rate limit: 1 req/s (IP)`
- Auth: `public`

> **Doc note —** This is the only page in the group that prints `Rate limit:`
> rather than `Frequency limit:`. Reproduced as printed.

### HTTP Request

`GET /api/v2/spot/market/whale-net-flow`

> **Doc note —** The path above comes from the page's own HTTP Request section,
> but the page's request example calls a *different* path,
> `https://api.bitget.com/api/v2/spot/market/fund-flow?symbol=BTCUSDT`. The
> Description section likewise reads "Get spot fund flow", which is the title of
> a separate endpoint in this group (`apidata/Get-Spot-Fund-Flow`). Treat the
> whale-net-flow path as the endpoint's own claim and the curl line as a stale
> copy; verify against the live API before use.

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `symbol` | String | Yes | Trading pair |

### Response Parameters

Returns an array of objects.

| Parameter | Type | Description |
|---|---|---|
| `volume` | String | Whale buy/sell volume (negative in the docs' examples) |
| `date` | String | Timestamp, described as "Millseconds time" — Unix milliseconds |

> **Doc note —** "Millseconds" is the docs' spelling. No interval, no window
> length and no unit of measure for `volume` are documented.

## Funding Assets

- Rate limit: `Frequency limit: 10 times/1s (User ID)`
- Auth: `private (signed)`

> **Doc note —** The scope is printed as `(User ID)` where the other signed
> endpoints in this group use `(UID)`. Reproduced as printed.

### HTTP Request

`GET /api/v2/account/funding-assets`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `coin` | String | No | Defaults to all coins |

### Response Parameters

Returns an array of objects (`data` is documented as `List<Object>`, with the
members below nested under it).

| Parameter | Type | Description |
|---|---|---|
| `coin` | String | Coin |
| `available` | String | Available balance |
| `frozen` | String | Frozen balance (docs' description reads "forzen") |
| `usdtValue` | String | Value in USDT |

> **Doc note —** "Sub-account requests are not allowed for the funding account",
> so this is main-account only. The response example shows `frozen` as an empty
> string, and the docs neither document a decimal scale nor say which
> denominates the funding account.

## Create Virtual Subaccount

- Rate limit: `Frequency limit: 5 times/1s (User ID)`
- Auth: `private (signed)`

> **A write endpoint on a public-looking group** — it is private/signed and
> creates account state, so it is out of Cachy's scope: account creation is not
> something a market calculator does.

### HTTP Request

`POST /api/v2/user/create-virtual-subaccount`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `subAccountList` | List&lt;String&gt; | Yes | Virtual alias — 8-character English letters, globally unique |

### Response Parameters

Two parallel arrays: `successList` for created sub-accounts, `failureList` for
rejected ones. Both carry the same member set.

| Parameter | Type | Description |
|---|---|---|
| `failureList` | Array | Creation failures — alias already exists, or the sub-account count limit is reached |
| `subaAccountName` | String | Sub-account name (as printed — `suba`, not `sub`) |
| `successList` | Array | Successfully created sub-accounts |
| `subaAccountUid` | String | Sub-account UID (as printed — `suba`, not `sub`) |
| `subaAccountName` | String | Sub-account name (as printed — `suba`, not `sub`) |
| `status` | String | `normal`, `freeze`, `del` |
| `permList` | List | Permissions — `spot_trade`, `contract_trade` (futures read-write), `read` |
| `label` | String | Note |
| `cTime` | String | Creation time, Unix millisecond timestamp |
| `uTime` | String | Update time, Unix millisecond timestamp |

> **Doc note —** The docs' own request example passes
> `{"subAccountList": ["testtest"]}`, a 9-character alias, against a parameter
> described as 8-character. The API key must also be bound to an IP address, and
> Bitget states the failure cases only in prose ("Alias already exists", "The
> number of sub-accounts created has reached the limit") without documenting the
> limit itself or an error code for it. `subaAccountName` appears under
> `failureList` too, where the example masks it as an email address
> (`****@*****.com`) although the field is described as a sub-account *name* —
> the two lists are not clearly distinguished.

---

**For:** Cachy App - Trade Execution Integration
**File:** `docs/bitget-api/11_public_endpoints.md`
