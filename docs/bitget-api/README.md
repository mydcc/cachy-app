# Bitget Classic Futures API — Documentation (Crawl)

A crawl of the official Bitget **Classic** Futures API documentation at:

- Source: <https://www.bitget.com/legacy-docs/classic/contract/intro>
- Crawled on: 2026-09-28
- Docs revision checked: Classic changelog `2026-08`
- Base domain REST API: `https://api.bitget.com`
- Base domain WebSocket: `wss://ws.bitget.com/v2/ws/public` (public) and
  `wss://ws.bitget.com/v2/ws/private` (private)
- Official SDKs: <https://github.com/BitgetLimited/V3-bitget-api-sdk> (carries
  both API generations), <https://github.com/bitget-golang/sdk-api>

> ## ⚠️ Bitget's V1 mix API is decommissioned
>
> Every `/api/mix/v1/…` path answers **HTTP 400** with
> `{"code":"30032","msg":"The V1 API has been decommissioned. Please migrate to a newer version."}`.
> Verified live on 2026-09-28 against `api.bitget.com` from an unauthenticated
> client.
>
> **9 of the 10 REST call shapes Cachy makes are on V1 paths and therefore
> cannot succeed against the live venue.** Only
> `GET /api/v2/mix/market/contracts` is already on V2 — the BUG-0501 fix.
>
> Migrating is **not** a path swap. V2 splits the order `side` field in two:
> `side` stops carrying open-versus-close and becomes position direction only,
> with a new `tradeSide` field carrying the close. A close ported without
> `tradeSide` is a valid **open** — it doubles the position instead of
> flattening it. Two required fields and one removed field complete the body
> change. See `09_v1_vs_v2.md` for the field-by-field delta and the hazard, and
> BUG-0576 for the migration itself, which is out of scope for this reference.
>
> V1 still appears in Bitget's own shipped Go SDK and in archived vendor docs.
> That is why the code still speaks it — not because it works.

## File overview

| File | Contents |
|---|---|
| `00_common.md` | Introduction, interface types, domains, response envelope, HTTP status codes |
| `01_sign.md` | REST and WebSocket signature procedures (incl. Go/Python code) |
| `02_account.md` | Account endpoints (balances, leverage, margin mode, position mode, bills) |
| `03_market.md` | Market data (tickers, depth, candles, funding rate, open interest, contract config) |
| `04_trade.md` | Order endpoints (place, batch, modify, cancel, flash close, history) |
| `05_position.md` | Position endpoints (single, all, history, ADL rank, tiers) |
| `06_tp_sl.md` | Trigger orders and TP/SL plan orders |
| `07_websocket.md` | WebSocket connection, login, public channels |
| `07_websocket_private.md` | Private push channels, request channels, WS-vs-REST mismatches |
| `08_error_codes.md` | The two vendor error-code tables — 829 REST and 154 WebSocket codes |
| `09_v1_vs_v2.md` | The two API generations side by side, and what migrating costs |
| `10_change_log.md` | Upstream crawl log, frozen at the crawl date |
| `11_public_endpoints.md` | Public and common endpoints: server time, notices, trade rates, funding assets, virtual sub-account |
| `12_doc_defects.md` | Quarantine for defects in Bitget's own documentation |
| `13_vendor_guidance.md` | Best practices, FAQ, UTA upgrade guide, demo trading |
| `14_uta_v3.md` | The UTA account family on `/api/v3/*` — verified live, not a doc mirror |
| `INTEGRATION_STATUS.md` | Reconciliation: which endpoints/channels Cachy already uses, what it emulates, what is missing |
| `QUICK_REFERENCE.md` | Developer cheat sheet |

This set mirrors `docs/bitunix-api/`. Five additions, none of which Bitunix
needs: `07_websocket_private.md`, because Bitget splits public and private
traffic across two endpoints; `08_error_codes.md`, `12_doc_defects.md` and
`13_vendor_guidance.md`, because Bitget publishes an unusually large and
unusually inconsistent body of prose that needs somewhere to live other than
the endpoint reference; and `09_v1_vs_v2.md`, because Bitget runs two API
generations side by side and Cachy speaks the dead one.

`14_uta_v3.md` is different in kind: it covers a third generation, and it is
built from signed live responses rather than transcribed from vendor pages.

## Coverage

Stated explicitly, because a mirror that does not say what it skipped cannot be
distinguished from a mirror that did not look.

### Mirrored in full

| Area | Source | Endpoints |
|---|---|---|
| Market | `contract/market` | 20 |
| Account | `contract/account` | 20 |
| Trade | `contract/trade` | 13 |
| Trigger / TP-SL | `contract/plan` | 9 |
| Position | `contract/position` | 5 |
| Public / common | `common/*` | 7 |
| WebSocket channels | `contract/websocket/{public,private}` | 14 |
| Error codes, REST | `contract/error-code/restapi` | 829 codes |
| Error codes, WebSocket | `contract/error-code/websocket` | 154 codes |
| Narrative | `best-practices`, `faq`, `uta-api-upgrade-guide`, `demotrading/*` | 4 pages |
| Reference | `intro`, `rate-limit`, `changelog` | 3 pages |

**88 endpoints and channels**, 67 of them in the Futures groups that Cachy
touches, plus 983 error codes and 4 pages of narrative guidance. Every
endpoint page's rate limit, auth requirement, request parameters and response
fields were transcribed, including the formatting defects.

Two groups are collapsed in Bitget's own navigation but fully transcribed
here: `contract/position` lists 2 entries in the sidebar while 5 pages exist,
and `contract/websocket` collapses to 1 entry while 14 channel pages exist.

### Deliberately not mirrored

Each of these is a product line Cachy does not integrate, not an oversight.

| Area | Why |
|---|---|
| Spot (`/api/v2/spot/*`) | Cachy trades futures only |
| Margin | Futures only |
| Copy Trading (16 pages) | No Cachy integration |
| Earn / Shark Fin | No Cachy integration |
| Tax, P2P, Affiliate, Broker, Inst Loan | No Cachy integration |
| ~~UTA / `/api/v3/*`~~ | **Was** listed here as "a family Cachy cannot authenticate against, therefore unverifiable". Removed 2026-10-03: a UTA account was obtained, and the assumption was backwards — the inability to authenticate was never a property of the API, it was the 40085 gate that blocks UTA accounts *from Classic paths*. See `14_uta_v3.md`. |

UTA is not in the mirrored set above because it is **not** a product line Cachy
declines to integrate — it is the generation Bitget marks as recommended, and it
may well be the one that matters. It has its own file.

If Cachy ever adds one of these product lines, that is a new backlog item and a
new file, not an extension of this set.

### What "verified" means here, and what it does not

Every rate limit, parameter and field name in the group files was read off a
live vendor page on 2026-09-28. The V1-decommission finding was verified
against the live API with unauthenticated requests.

Everything about **request signing and order behaviour** is *not* verified,
because verifying it needs credentials and a sandbox:

- Whether query parameters must be sorted before signing (`01_sign.md`) — the
  blocker on the whole migration.
- Which code a WebSocket login success actually carries (`01_sign.md`).
- What each V2 response looks like on the wire, since V1 is undocumented
  (`09_v1_vs_v2.md`).
- Whether `symbol-price` requires a signature, and whether `granularity=2H` is
  accepted (`03_market.md`).

These are marked **Unresolved** in place rather than resolved by inference.
`12_doc_defects.md` lists every documentation self-contradiction found and
whether it could be settled.

**Updated 2026-10-03**, with a UTA account (`14_uta_v3.md`):

- Query ordering — **resolved for `/api/v3/*`**: both insertion and sorted order
  return `00000`, with a wrong-secret control at `40009`. Still open for
  `/api/v2/*`, which the 40085 gate blocks.
- WebSocket login code — **resolved**: `code` is the number `0`, not `"0"` and
  not `"00000"`.
- Traded-amount field — **resolved**: `cumExecQty` for the aggregate, `execQty`
  per fill. `filledQty` exists in no generation.
- Still unverified, and now also blocked on a Classic-mode account: the V2
  response shapes, and whether the write path behaves as documented.

## Quick overview of the API surface

### Two account families, one reference

Bitget runs two trading systems side by side, and confusing them is the easiest
way to build something that silently misbehaves:

- **Classic** — what Cachy talks to. Documented here.
- **UTA** (Unified Trading Account) — Bitget's recommended family, on `/api/v3/*`.
  Pointers only.

They are not drop-in replacements. The largest divergence is order direction:
UTA closes a long with `side=sell`, Classic closes a long with `side=buy`
(see `09_v1_vs_v2.md`).

### Interface types

- **Public**: no authentication (market data, contract configuration). Rate
  limits are counted **per IP**.
- **Private**: requires a signature (see `01_sign.md`). Rate limits are counted
  **per UID**.

The IP/UID split is not cosmetic. A public limit and a private limit on the
same nominal path budget against different counters.

### Mandatory headers for every signed REST request

| Header | Description |
|---|---|
| `ACCESS-KEY` | API key of the request |
| `ACCESS-SIGN` | Signature string (see `01_sign.md`) |
| `ACCESS-TIMESTAMP` | Current timestamp in **milliseconds** |
| `ACCESS-PASSPHRASE` | Passphrase chosen when the key was created |
| `Content-Type` | Always `application/json` |

There is **no** `recvWindow` and **no** `nonce` on Bitget. Bitunix has both; do
not port that vocabulary across.

### Basic signature procedure (REST)

```
prehash = timestamp + METHOD + requestPath + body
sign    = Base64(HMAC-SHA256(prehash, secretKey))
```

`requestPath` includes the query string, and query parameters are **not
sorted** — they go on the wire in insertion order. Verified harmless on
`/api/v3/*` (both orders accepted, see `14_uta_v3.md`); still unverified on
`/api/v2/*`.

> **Cachy divergence (client-side signing):** the signature is computed in the
> browser via WebCrypto, so the secret never leaves the device and the proxy
> forwards an already-signed request. The procedure above is unchanged; only the
> location moved. See
> [`adr/0013-client-side-exchange-signing.md`](../adr/0013-client-side-exchange-signing.md).
>
> `ACCESS-PASSPHRASE` is the ADR-0013 named exception: it is the one credential
> that does cross to the proxy, because Bitget requires it on the wire and
> Bitget's signature scheme gives no way to derive it.

### HTTP status codes

- `200` – success (business errors also arrive as `200`; read `code` in the body)
- `400` – bad request, including the V1-decommissioned `30032`
- `403` – forbidden
- `404` – not found
- `429` – rate limited
- `500` – internal server error

Bitget reports a business failure inside a `200` body as a non-zero `code`
(`"00000"` is success). A client that only checks the HTTP status will read a
failed order placement as a success.

## Endpoint overview (quick reference)

All 67 Classic Futures endpoints, grouped as the docs group them. Per-endpoint
rate limits, auth, parameters and responses are in the linked files.

### Market (`03_market.md`) — public, no API key

- `GET  /api/v2/mix/market/discount-rate`
- `GET  /api/v2/mix/market/exchange-rate`
- `GET  /api/v2/mix/market/union-interest-rate-history`
- `GET  /api/v2/mix/market/vip-fee-rate`
- `GET  /api/v2/mix/market/merge-depth`
- `GET  /api/v2/mix/market/ticker`
- `GET  /api/v2/mix/market/tickers`
- `GET  /api/v2/mix/market/fills`
- `GET  /api/v2/mix/market/fills-history`
- `GET  /api/v2/mix/market/candles`
- `GET  /api/v2/mix/market/history-candles`
- `GET  /api/v2/mix/market/history-index-candles`
- `GET  /api/v2/mix/market/history-mark-candles`
- `GET  /api/v2/mix/market/open-interest`
- `GET  /api/v2/mix/market/current-fund-rate`
- `GET  /api/v2/mix/market/history-fund-rate`
- `GET  /api/v2/mix/market/funding-time`
- `GET  /api/v2/mix/market/symbol-price` — signed, despite living in this group
- `GET  /api/v2/mix/market/contracts`
- `GET  /api/v2/mix/market/oi-limit`

### Account (`02_account.md`) — private

- `GET  /api/v2/mix/account/account`
- `GET  /api/v2/mix/account/accounts`
- `GET  /api/v2/mix/account/sub-account-assets`
- `GET  /api/v2/mix/account/open-count`
- `GET  /api/v2/mix/account/liq-price`
- `GET  /api/v2/mix/account/max-open`
- `GET  /api/v2/mix/account/interest-history`
- `POST /api/v2/mix/account/set-all-leverage`
- `POST /api/v2/mix/account/set-leverage`
- `POST /api/v2/mix/account/set-margin`
- `POST /api/v2/mix/account/set-auto-margin`
- `POST /api/v2/mix/account/set-margin-mode`
- `POST /api/v2/mix/account/set-position-mode`
- `POST /api/v2/mix/account/set-asset-mode`
- `GET  /api/v2/mix/account/bill`
- `POST /api/v2/mix/account/union-convert`
- `GET  /api/v2/mix/account/transfer-limits`
- `GET  /api/v2/mix/account/union-config`
- `GET  /api/v2/mix/account/switch-union-usdt`
- `GET  /api/v2/mix/account/isolated-symbols`

### Trade (`04_trade.md`) — private

- `POST /api/v2/mix/order/place-order`
- `POST /api/v2/mix/order/click-backhand`
- `POST /api/v2/mix/order/batch-place-order`
- `POST /api/v2/mix/order/modify-order`
- `POST /api/v2/mix/order/cancel-order`
- `POST /api/v2/mix/order/batch-cancel-orders`
- `POST /api/v2/mix/order/close-positions`
- `GET  /api/v2/mix/order/detail`
- `GET  /api/v2/mix/order/fills`
- `GET  /api/v2/mix/order/fill-history`
- `GET  /api/v2/mix/order/orders-pending`
- `GET  /api/v2/mix/order/orders-history`
- `POST /api/v2/mix/order/cancel-all-orders`

### Trigger / TP-SL (`06_tp_sl.md`) — private

- `POST /api/v2/mix/order/place-plan-order`
- `POST /api/v2/mix/order/place-tpsl-order`
- `POST /api/v2/mix/order/place-pos-tpsl`
- `POST /api/v2/mix/order/modify-tpsl-order`
- `GET  /api/v2/mix/order/plan-sub-order`
- `POST /api/v2/mix/order/modify-plan-order`
- `POST /api/v2/mix/order/cancel-plan-order`
- `GET  /api/v2/mix/order/orders-plan-pending`
- `GET  /api/v2/mix/order/orders-plan-history`

### Position (`05_position.md`) — private

- `GET  /api/v2/mix/market/query-position-lever` — note the `/market/` prefix
- `GET  /api/v2/mix/position/single-position`
- `GET  /api/v2/mix/position/history-position`
- `GET  /api/v2/mix/position/adlRank` — note the camelCase path segment
- `GET  /api/v2/mix/position/all-position`

### WebSocket — public channels (`07_websocket.md`)

- `ticker` (300–400 ms, carries `markPrice` and `indexPrice`)
- `books`, `books1`, `books5`, `books15` (order book, snapshot and incremental)
- `candle*` — `candle1m` … `candle1Mutc`
- `trade` (taker prints)

### WebSocket — private channels (`07_websocket.md`)

- `account`, `equity`, `fill`, `positions`, `positions-history`, `orders`,
  `orders-algo`, `adl-noti`
- Two request channels, not pushes: `op:"trade"` `place-order` and
  `cancel-order`

---

**For:** Cachy App - Trade Execution Integration
**File:** `docs/bitget-api/README.md`
