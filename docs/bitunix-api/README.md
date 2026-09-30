# Bitunix Futures OpenAPI – Documentation (Crawl)

This documentation is a complete crawl of the official Bitunix Futures OpenAPI
documentation at:

- Source: https://www.bitunix.com/api-docs/futures/common/introduction.html
- Crawled on: 08.08.2026, re-audited against the live sidebar on 2026-09-28 (54 of 54 pages)
- Base domain REST API: `https://fapi.bitunix.com`
- Base domain WebSocket: `wss://fapi.bitunix.com/public/` (public) and
  `wss://fapi.bitunix.com/private/` (private)
- Official demo repo: https://github.com/BitunixOfficial/open-api

## File overview

| File | Contents |
|---|---|
| `00_common.md` | Introduction, auth headers, interaction model, standards |
| `01_sign.md` | REST & WebSocket signature procedure (incl. Go/Python code) |
| `02_account.md` | Account endpoints (leverage, margin, position mode, balance) |
| `03_copytrading.md` | CopyTrading asset endpoints (sub-account transfers) |
| `04_market.md` | Market data (depth, funding rate, kline, ticker, trading pairs) |
| `05_position.md` | Position endpoints (history, pending, tiers) |
| `06_tp_sl.md` | Take-profit / stop-loss endpoints |
| `07_trade.md` | Order endpoints (place, modify, cancel, batch, history) |
| `08_websocket.md` | WebSocket connection, login, all private & public channels |
| `09_error_codes.md` | Complete error code table — 76 codes, plus the vendor's defects in them |
| `10_change_log.md` | Changelog of the official documentation |
| `12_doc_defects.md` | Quarantine: where Bitunix's own docs are wrong, and where this mirror silently repaired them |
| `INTEGRATION_STATUS.md` | Reconciliation: which endpoints/channels Cachy already uses, what is missing |
| `QUICK_REFERENCE.md` | Developer cheat sheet |
| `timeframes.md` | Kline intervals Bitunix serves natively vs. what Cachy synthesizes |

## House rules for this mirror

Two rules, both learned the hard way and both enforced by
`12_doc_defects.md`:

1. **Transcribe verbatim. Mark every repair.** Where Bitunix's page is wrong,
   the wrong text stays and a note says so. Silently fixing a vendor error makes
   a mirror impossible to diff against its source — and, historically, produced
   a *different* error that then read as transcribed fact: a `nonce`
   description of "32-char hex string (128-bit random)" that appears on no
   Bitunix page, was internally contradictory, and had spread across three files
   before it was caught. An invented sentence in a reference is worse than a
   missing one.
2. **Cachy-side knowledge is labelled as such.** Notes about what Cachy does,
   assumes, or has observed are marked and kept separate from vendor text.

## Coverage

Stated explicitly, because a mirror that does not say what it skipped cannot be
distinguished from a mirror that did not look.

### Mirrored — 54 of 54 pages

Measured from the live sidebar on 2026-09-28, not from memory:

| Group | Vendor pages | File | Endpoints |
|---|---|---|---|
| Account | 8 | `02_account.md` | 8 |
| Common | 2 | `00_common.md`, `01_sign.md` | 2 |
| CopyTrading | 3 | `03_copytrading.md` | 3 |
| Error codes | 1 | `09_error_codes.md` | 76 codes |
| Log | 1 | `10_change_log.md` | 1 |
| Market | 7 | `04_market.md` | 7 |
| Position | 3 | `05_position.md` | 3 |
| TP/SL | 7 | `06_tp_sl.md` | 7 |
| Trade | 11 | `07_trade.md` | 11 |
| WebSocket | 11 | `08_websocket.md` | 11 (4 private, 6 public, 1 connect) |
| **Total** | **54** | | **42 endpoints + 11 channels + 1 log** |

**Nothing is missing.** Every page the vendor publishes for Futures is
transcribed. `get_position_mode` and `get_trading_settings` were added on
2026-09-28 — the first crawl had missed two of the eight Account endpoints.

Bitunix's Futures surface has no product line this set skips: there is no
Spot/Margin/Copy-trading-of-trading split, no second account family, and no
decommissioned generation to document separately. By contrast the Bitget mirror (FEAT-0525, a separate branch) covers 88
endpoints of one product line out of a much larger site, and has to state what
it left out.

### Not mirrored

| Area | Why |
|---|---|
| The plan-order family (`/api/v1/futures/plan/*`) | **Undocumented by the vendor.** No `plan` section in the sidebar, and `…/futures/plan/get_history_plan_orders.html` returns 404. Cachy calls one of these endpoints anyway — see `INTEGRATION_STATUS.md` |
| Bitunix Spot, and the other product lines | Cachy trades futures only |
| Announcement / notice endpoints | Bitunix publishes none for API consumers |

### What "verified" means here, and what it does not

Every rate limit, parameter, field name and error code in this set was
transcribed from the live vendor pages, and the set was re-audited against them
on 2026-09-28. The error-code table was checked code by code: **76 codes, none
missing, none added.**

What is **not** verified is request signing and live behaviour, because
verifying it needs credentials and a sandbox. Recorded as unresolved in place
rather than settled by inference:

- Whether `params` belongs in the WebSocket prehash — Bitunix's two pages
  disagree (`01_sign.md`).
- The WebSocket login timestamp unit — seconds on four sources, milliseconds in
  one example (`01_sign.md`).
- The real `nonce` width and charset, which the vendor states three different
  ways (`01_sign.md`).
- **The `wallet`/`balance` and `tp_sl`/`tpsl` private channel names** — the code
  and this mirror say one thing, the vendor says another, and the code's own
  justification cites this documentation set. If the vendor is right, no balance
  and no TP/SL update ever arrives, silently (`08_websocket.md`,
  `12_doc_defects.md`).
- The `fundingRate` unit on the history endpoint — no code reads it
  (`04_market.md`, `QUICK_REFERENCE.md`).

## Quick overview of the API structure

### Interface types

- **Public**: no authentication needed (market data, configuration)
- **Private**: requires a signature via `api-key`, `nonce`, `timestamp`, `sign`

### Private WS channels (wire names)

Cachy subscribes `position`, `order`, `wallet` (balance), `tp_sl` — see
`08_websocket.md`. `depth_books/book1/book15`, `tickers` batch, funding
history, tiers, `trading_pairs`, batch/plan-order verbs are intentionally
unwired — see `INTEGRATION_STATUS.md` and the adapter verb table in
`unsupportedVerbs.test.ts`.

### Mandatory headers for all REST requests

| Header | Description |
|---|---|
| `api-key` | API key of the request |
| `nonce` | `Random string，32bits` [sic] — see `01_sign.md` |
| `timestamp` | Current timestamp in milliseconds |
| `sign` | Signature string (see `01_sign.md`) |
| `Content-Type` | Always `application/json` |

### Basic signature procedure (REST)

```
digest = SHA256(nonce + timestamp + api-key + queryParams + body)
sign   = SHA256(digest + secretKey)
```

> **Cachy divergence (since 1.6.0, FEAT-0405):** the signature is computed
> client-side in the browser via WebCrypto — the secret never leaves the device
> and the proxy only forwards the finished signature. The procedure above is
> therefore unchanged (vendor reference); only its location moved. See
> [`adr/0013-client-side-exchange-signing.md`](../adr/0013-client-side-exchange-signing.md).

### HTTP status codes

- `200` – success (also for business errors; see `errorCode` in the body)
- `400` – bad request
- `403` – forbidden
- `404` – not found
- `500` – internal server error

## Endpoint overview (quick reference)

### Account

- `POST /api/v1/futures/account/adjust_position_margin`
- `POST /api/v1/futures/account/change_leverage`
- `POST /api/v1/futures/account/change_margin_mode`
- `POST /api/v1/futures/account/change_position_mode`
- `GET  /api/v1/futures/account/get_leverage_margin_mode`
- `GET  /api/v1/futures/account/position_mode`
- `GET  /api/v1/futures/account/trading_settings`
- `GET  /api/v1/futures/account`

### CopyTrading

- `GET  /api/v1/cp/asset/query`
- `POST /api/v1/cp/asset/transfer-to-sub-account`
- `POST /api/v1/cp/asset/transfer-to-main-account`

### Market

- `GET /api/v1/futures/market/depth`
- `GET /api/v1/futures/market/funding_rate/batch`
- `GET /api/v1/futures/market/get_funding_rate_history`
- `GET /api/v1/futures/market/funding_rate`
- `GET /api/v1/futures/market/kline`
- `GET /api/v1/futures/market/tickers`
- `GET /api/v1/futures/market/trading_pairs`

**Funding rate (see `04_market.md` for the full schema):** the docs describe
`fundingRate` as a fraction (example `"0.0005"`), but live wire data confirms
that Bitunix actually returns it already as a **percentage** (e.g. `"-0.005776"`
corresponded to `-0.0057 %` at Bitunix, not `-0.5776 %`). Cachy normalises this
on ingestion in `apiService.fetchBitunixFundingRates()` — see the comment
there. In addition, the batch endpoint also contains coin-/USDC-margined
variants (`BTCUSD`, `BTCUSDC`, …) that Cachy does not need; only `...USDT`
pairs are processed.

### Position

- `GET /api/v1/futures/position/get_history_positions`
- `GET /api/v1/futures/position/get_pending_positions`
- `GET /api/v1/futures/position/get_position_tiers`

### TP/SL

- `POST /api/v1/futures/tpsl/cancel_order`
- `GET  /api/v1/futures/tpsl/get_history_orders`
- `GET  /api/v1/futures/tpsl/get_pending_orders`
- `POST /api/v1/futures/tpsl/position/modify_order`
- `POST /api/v1/futures/tpsl/modify_order`
- `POST /api/v1/futures/tpsl/position/place_order`
- `POST /api/v1/futures/tpsl/place_order`

### Trade

- `POST /api/v1/futures/trade/batch_order`
- `POST /api/v1/futures/trade/cancel_all_orders`
- `POST /api/v1/futures/trade/cancel_orders`
- `POST /api/v1/futures/trade/close_all_position`
- `POST /api/v1/futures/trade/flash_close_position`
- `GET  /api/v1/futures/trade/get_history_orders`
- `GET  /api/v1/futures/trade/get_history_trades`
- `GET  /api/v1/futures/trade/get_order_detail`
- `GET  /api/v1/futures/trade/get_pending_orders`
- `POST /api/v1/futures/trade/modify_order`
- `POST /api/v1/futures/trade/place_order`

### WebSocket – Private Channels

- Balance Channel
- Order Channel
- Position Channel
- Tp Sl Channel

### WebSocket – Public Channels

- Depth Channel (`depth_books`, `depth_book1`, `depth_book5`, `depth_book15`)
- Kline Channel (`market_kline_*`, `mark_kline_*`)
- MarketPrice Channel (`price`) — `fr` field is documented as "Funding Rate"
  without a stated scale; live data suggests it's a percentage like the REST
  `fundingRate` field above, not the fraction its own doc example implies.
- Ticker Channel (`ticker`)
- Tickers Channel (`tickers`)
- Trade Channel (`trade`)

---

**For:** Cachy App - Trade Execution Integration
**File:** `docs/bitunix-api/README.md`
