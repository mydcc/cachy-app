# Error codes and documentation defects

Crawled on: 2026-09-28.

Two things live here: the error codes this reference can actually evidence, and
a quarantine for defects in Bitget's own documentation. They are separated on
purpose — a vendor typo is not a finding about Cachy, and mixing the two makes
both harder to trust.

## ⚠️ Bitget publishes no error code table for Classic

There is no machine-readable or even human-readable enumeration of Classic
Futures error codes anywhere in the documentation. What exists instead:

- Each endpoint page documents its own `code` / `msg` response fields but no
  code values.
- `code: "00000"` is the only success value documented anywhere, consistently
  across every group.
- Deprecations and behaviour changes are announced through
  `GET /api/v2/public/annoucements` (`annType: product_updates`,
  `annSubType: futures_maintenance`, among others). Note the path is
  misspelled `annoucements` in the vendor docs and in the live API.

So an error code in the wild cannot be looked up in this reference. Codes
appear in `10_change_log.md` when Bitget happens to name one.

A client must therefore be written to branch on `code === "00000"` and treat
everything else as failure, rather than branching on specific codes. That is
what Cachy does.

## Codes observed

Only these are evidenced. Each was seen in a dated call, not read off a
vendor table.

| Code | Meaning | Where it came from |
|---|---|---|
| `00000` | Success | Every documented response envelope |
| `30032` | *"The V1 API has been decommissioned. Please migrate to a newer version."* | Live call, 2026-09-28, HTTP `400`. See `09_v1_vs_v2.md` |
| `400172` | *"Parameter verification failed"* | Live call, 2026-09-28, HTTP `400`, V2 `candles` with a V1-style symbol |
| `30005` | WebSocket login failure | `07_websocket.md`, documented failure event |
| `22067` | *"Operations are prohibited during ADL processing."* | Changelog, 2025-02-03 |
| `45001`, `40725`, `40808` | Transient errors during the weekly backend release window | Changelog, 2025-05-19 |
| `40882` | *"You are currently a trader and you cannot switch to the full position mode"* | Changelog — **deleted** 2025-04-21 |

### The weekly release window is a scheduled error source

Bitget publishes its backend release schedule: **Tuesdays, Wednesdays and
Thursdays, 14:00–17:00 UTC+8**, excluding emergency releases. During that
window:

- REST may return `45001`, `40725` or `40808`. Bitget's instruction: *"Users
  can retry after receiving these error responses."*
- **WebSocket connections may be disconnected.**

Three named codes for one scheduled window, on a recurring schedule, is worth
knowing before diagnosing a spike. `07_websocket.md` covers the reconnect
requirement; a REST client needs these three codes to be retried rather than
surfaced.

### Rate-limit recovery is 5 minutes, not 1

Changelog, 2025-08-11: the overall limit of 6,000 requests per IP per minute was
introduced, and on tripping it *"the recovery time is adjusted from 1 minute to
5 minutes."*

Worth comparing against Cachy: `apiQuotaTracker` treats a `429` as sticky for
**6 hours** (`src/services/apiQuotaTracker.svelte.ts:107`). That is far longer
than the venue's own 5-minute recovery, so a throttled Bitget session stays
degraded far after the venue would have served it. Not wrong — Bitunix may
warrant a longer hold — but the two venues are being treated identically and
only one of them needs it.

## Quarantine: defects in Bitget's documentation

Bitget's Classic docs carry a large number of internal contradictions. They are
catalogued per group in the group files, which is where a reader looking at a
specific endpoint will find them:

| Group | Where its defect list lives |
|---|---|
| Market | `03_market.md` → *Cross-cutting doc defects* |
| Account | `02_account.md` → *Cross-cutting observations for this group* |
| Trade | `04_trade.md` → *Defect list (this group)* |
| Position | `05_position.md` → *Cross-cutting observations for this group* |
| Trigger / TP-SL | `06_tp_sl.md` → *Defect list (this group)* |
| WebSocket | `07_websocket_private.md` → *Defect list (this group)* |

Roughly 95 were catalogued during the crawl. The cross-cutting ones that would
mislead a client rather than merely confuse a reader:

### Response field names that are misspelled on the wire

- **`shortLeveage`** — missing the `r` in "leverage". Returned by
  `set-leverage` and `set-margin-mode`. The request tables and the response
  JSON examples on the same pages use the correct `shortLeverage`, so the typo
  is in the field table a client would read.
- **`unrealizedPL for croessed`** — `croessed` for `crossed`.
- **`risk_captital_user_transfer`** — `captital` for `capital`, in the
  `businessType` enumeration of `Get Account Bills`.
- **`reuqest`**, **`timestampis`**, **`timestamp`**, **`sueexeeful`**,
  **`notExistend`** — prose typos, harmless but they date the pages.
- **`annoucements`** — the announcements endpoint path is misspelled in the API
  itself, so this one cannot be corrected by a client.

### Casing that changes between pages

- `reduceOnly` is `YES`/`NO` on `place-order`, lowercase `yes`/`no` on
  `place-plan-order`, lowercase again on the WebSocket orders push, and
  uppercase in the REST order-detail response. Four pages, two conventions.
- `marginMode` is `fixed`/`crossed` on the WebSocket `positions-history`
  channel and `isolated`/`crossed` everywhere else.
- `marginCoin` is `USDT` in parameter tables and lowercase `usdt` in the
  examples, on write endpoints that explicitly state *"margin coin must be
  capitalized"*.
- `productType` is uppercase in every parameter table and lowercase in **14 of
  20** market `curl` examples.
- `ctime`/`utime` on `history-position` versus `cTime`/`uTime` everywhere else
  — a real wire difference, not prose.
- Order status is `status` on the WebSocket orders channel and `state` in the
  REST order-detail response.

Casing is the most dangerous class on this list, because a client that matches
case-insensitively will appear to work and a client that matches exactly will
fail on the one page nobody tested.

### Structural mismatches

- `idLessThan` is described on several pages as "the endId". They are different
  fields: `idLessThan` is a request cursor, `endId` is a response field.
- `Get Query Position Lever` is served from `/api/v2/mix/market/query-position-lever`
  despite being a Position endpoint, and is the only Position endpoint limited
  per **IP** rather than per UID.
- `Get Position Adl Rank` is served from `/api/v2/mix/position/adlRank` with a
  camelCase path segment, marked Required while simultaneously documenting a
  default.
- `Cancel All Orders` documents `requestTime` and `receiveWindow` as **request
  body** parameters. Both are header/signing concepts, and `receiveWindow` does
  not exist on Bitget at all.
- `Get Isolated Symbols` and `My Estimated Open Count` have example `curl`
  hosts of `https://api/v2/…` — the `api.bitget.com` hostname is missing.
- `place-pos-tpsl` returns an array in `data` whose element count and per-element
  meaning are never stated; the example returns two elements for one requested
  position leg.
- `Get Single Account` documents response field `equity` while its example
  returns `accountEquity`.
- `Get Historical Position` documents the identity
  `netProfit = pnl + totalFunding + openFee + closeFee`, which sums
  margin-currency and base-currency terms.

### Sample data that cannot be real

Several response examples are internally impossible, which matters because they
become the fixtures someone tests against:

- `Get Single Position` and `Get All Positions` examples carry liquidation
  prices roughly 187× and 61× the mark price, and one shows a short whose
  liquidation price sits **above** the mark price.
- `Get Liquidation Price` returns a negative liquidation price.
- `Get Ticker` and `Get All Tickers` examples have `markPrice` values
  inconsistent with `lastPr`.
- `Get Account List` shows `"unionTotalMargin": "111,1"` — a numeric string
  with a decimal comma.
- `Get Interest history` has a placeholder `endId` of `"xxxxxxxxxxxxxxx"`.
- `Get Account Bills` describes `endId` in terms of an `idGreaterThan` parameter
  that does not exist.

**Unverified:** whether the implausible `liquidationPrice` values are doc
artifacts or genuine API output. No live authenticated call was made. Recorded
as suspect sample data, not as a claim about the API.

### Documentation self-contradictions

These need judgement rather than transcription, and each is flagged in place:

| Topic | Where | Status |
|---|---|---|
| `side` in one-way vs hedge mode | `00_common.md` | Resolved — the docs are explicit |
| Place Order close sizing against an occupying limit order | `04_trade.md` | **Resolved by the changelog** — see below |
| WebSocket login timestamp unit (ms vs seconds) | `01_sign.md` | Unresolved. Seconds is correct; the prose is wrong |
| WebSocket login success code (`"0"` vs `"00000"`) | `01_sign.md` | Unresolved |
| REST query parameter ordering (sorted vs insertion order) | `01_sign.md`, `09_v1_vs_v2.md` | **Unresolved and blocking** |
| `granularity=2H` (in the retention table, absent from the enum) | `03_market.md` | Unresolved |
| `force: "normal"` in signature-page samples | `01_sign.md` | Resolved — `normal` is not a V2 value; those samples are V1 leftovers |
| Whether `symbol-price` really requires a signature | `03_market.md` | Unresolved — no auth line is printed |

#### The close-sizing contradiction, and how the changelog settles it

`POST /api/v2/mix/order/place-order` carries two mutually contradictory
paragraphs. One says an over-sized market close against an occupying limit close
returns an insufficient-position error; the next says it does not error and
partially closes instead; a third says an exactly-sized close auto-cancels the
limit order.

Changelog entry **2025-07-31, *Optimization of the futures order placement
interface logic*** resolves it:

> **before:** In hedge mode, if the existing quantity is equal to the limit
> close order of the position, a newly added market close order will report an
> error due to insufficient position and will not automatically cancel the limit
> order that has occupied the position.
>
> **after:** In hedge mode, if the existing quantity is equal to the limit close
> close order of the position, a newly added market close order will
> **automatically cancel the limit order** that has occupied the position
> (consistent with Web/APP).

So the "insufficient position error" paragraph is stale documentation of
behaviour Bitget removed in July 2025, and the doc page was never updated. The
current rule is that the market close cancels the occupying limit order rather
than failing.

That matters beyond tidiness: a close that used to fail now **cancels a resting
limit order as a side effect**. Anything in the UI that promises "this close
does not touch your other orders" is no longer true for Bitget.

---

**For:** Cachy App - Trade Execution Integration
**File:** `docs/bitget-api/08_error_codes.md`
