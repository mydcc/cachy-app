# UTA (Unified Trading Account) — `/api/v3/*`

Source: <https://www.bitget.com/legacy-docs/uta/intro>, `/uta/guide`, `/uta/trade/*`,
`/uta/account/*`, `/uta/position/*`. Read 2026-10-03.
Base domain REST: `https://api.bitget.com` · WebSocket: `wss://ws.bitget.com/v3/ws/public`
and `wss://ws.bitget.com/v3/ws/private`.

Every claim marked **Verified** below was observed live on 2026-10-03 against
`api.bitget.com` with a signed request from a UTA account. Claims marked
**Documented** are transcribed from the vendor page and were not observed.

This file exists because `README.md` previously stated that UTA could not be
mirrored "because a mirror of a family Cachy cannot authenticate against would be
unverifiable". That is no longer true, and the assumption it rested on was the
wrong way round — see [The gate](#the-gate-cachy-hit-first).

## The gate Cachy hit first

**Verified.** A UTA account cannot call the Classic `/api/v2/*` API at all:

```
GET /api/v2/mix/account/account?productType=USDT-FUTURES&marginCoin=USDT
→ HTTP 400  {"code":"40085","msg":"You are in Unified Account mode, and the Classic
             Account API is not supported at this time"}
```

The gate fires **before signature validation**. A request with a deliberately
wrong secret, and a request with a wrong passphrase, both return the same
`40085` — not a signature error. So a `40085` tells you nothing about whether
your signing is correct, and a V2 call that "works but returns 40085" cannot be
read as evidence in either direction.

This is why the V2 questions in `01_sign.md` and `09_v1_vs_v2.md` are still open:
they cannot be settled from a UTA account.

The UTA and Classic WebSocket hosts are **not** gated the same way — **Verified**:
`wss://ws.bitget.com/v2/ws/private` accepted a login frame from a UTA account.
The 40085 gate is REST-only.

## Endpoints verified live

| Method | Path | Result |
|---|---|---|
| `GET` | `/api/v3/account/assets?category=USDT-FUTURES` | `00000`, object |
| `GET` | `/api/v3/account/fee-rate?category=SPOT&symbol=BTCUSDT` | `00000`, object |
| `GET` | `/api/v3/trade/unfilled-orders?category=USDT-FUTURES` | `00000`, `{list: [], cursor: null}` |
| `GET` | `/api/v3/trade/fills?category=USDT-FUTURES` | `00000`, `{list: null, cursor: null}` |
| `GET` | `/api/v3/position/current-position?category=USDT-FUTURES` | `00000`, `{list: null}`, no `cursor` — but see trap 3 |

### Account/assets top-level keys, observed live

The `00000` above was verified with the full key list, transcribed from the
response (values omitted — the account is empty, so they prove nothing):

```
accountEquity, usdtEquity, btcEquity, unrealisedPnl, usdtUnrealisedPnl,
btcUnrealizedPnl, effEquity, mmr, imr, mgnRatio, positionMgnRatio,
positionValue, leverage, ...
```

plus `assets[]` per coin (`coin`, `equity`, `usdValue`, `balance`,
`balanceOriginal`, `available`, `debt`, `locked`, `bonus`, `interestBase` —
from the vendor's documented sample, same page).

Two things to read carefully here, because both are traps for a parser author:

- The **spelling varies by field**: `unrealisedPnl` and `usdtUnrealisedPnl`
  (with-s) sit beside `btcUnrealizedPnl` (with-z). Normalising to one spelling
  reads two of the three as missing.
- The semantics that matter for mapping: `accountEquity` is the USD total
  (what a balance display wants), `effEquity` is documented as *"the net value
  available for margin in spot and perpetual trades under cross-margin mode"*
  (what an "available" display wants), `mmr` is the maintenance margin and
  `imr` the initial margin requirement. There is no single margin-coin or
  frozen total — UTA is multi-asset.

Confirmed absent (`40404 Request URL NOT FOUND`) — these are V2-shaped guesses
that do not exist, recorded so nobody repeats them:

- `/api/v3/mix/account/account`, `/api/v3/mix/position/all-position`,
  `/api/v3/mix/order/orders-pending`, `/api/v3/mix/order/orders-history`
- `/api/v3/contract/position/all-position`, `/api/v3/futures/position/all-position`,
  `/api/v3/contract/account`, `/api/v3/trade/orders-pending`,
  `/api/v3/trade/orders-history`, `/api/v3/position/position-history`

UTA is not `/api/v3/mix/*` with a new number. It is re-grouped by domain:
`/api/v3/account/*`, `/api/v3/trade/*`, `/api/v3/position/*`.

## Three traps in the verified responses

### 1. `data` is an object with a `list`, not an array

```json
{"code":"00000","msg":"success","requestTime":1791031742023,
 "data":{"list":[],"cursor":null}}
```

Cachy's current Bitget parsers do `const orders = res.data || []; orders.map(...)`.
Against UTA that iterates the two keys of an object and yields two garbage
`NormalizedOrder`s, or throws. Pagination is a cursor, not `pageNo`/`endId`.

### 2. `list` can be `null`, not `[]`

`/api/v3/trade/fills` answered `{"list":null,"cursor":null}` on an account with
no fills, while `/api/v3/trade/unfilled-orders` answered `{"list":[],...}` for the
equally empty case. A parser that does `data.list.map(...)` without a null guard
throws on the fills endpoint and works on the other. Verified once, on an empty
account — recorded as observed, not as a general rule.

### 3. A 200 can arrive with no body at all

`/api/v3/position/current-position` with a valid `category` usually answers like
any other endpoint:

```json
{"code":"00000","msg":"success","requestTime":1791032984524,"data":{"list":null}}
```

Note it carries **no `cursor` key** — unlike the two trade endpoints. But twice,
the same request on the same unchanged account answered **HTTP 200 with a
zero-byte body**. With no parameters it returns `400172 Parameter verification
failed`, so the path exists and `category` is required.

Both empty answers came early in one session, and six consecutive calls
afterwards returned the normal 81-byte body. Whether this is a rate or a
transient server-side window is **unknown** — recorded as observed, not
characterised.

An empty body on a 200 is rarer and more dangerous than a stable alternative
shape: a parser cannot branch on it, because the next identical call succeeds.
Cachy's Bitget path reads `res.code` after parsing, so this surfaces as
`Bitget Error: undefined` rather than as an empty position list. A client has to
treat an unparseable 200 as "no data" and retry, not as an error to surface.

This is the same failure shape BUG-0576 records for the V1 parser, and it is why
`marketData.ts` logs truncated fetches.

## Where the traded amount actually lives

This is the answer to **BUG-0589**, which recorded that Cachy reads `filledQty`
from V1 endpoints and that the string `filledQty` appears nowhere in the mirror.

**Verified:** `filledQty` exists in neither generation. UTA splits the quantity
three ways, and all three fields were observed on the wire:

| Meaning | UTA field | Where |
|---|---|---|
| Ordered size | `qty` | unfilled orders |
| Cumulative filled size | `cumExecQty` | unfilled orders |
| Size of one execution | `execQty` | fills |

The documented fills sample (from `/uta/trade/Get-Order-Fills`) carries
`execId`, `execPrice`, `execQty`, `execValue`, `tradeScope`, `feeDetail[]`,
`execPnl`. The documented unfilled-orders sample carries `qty`, `amount`,
`cumExecQty`, `cumExecValue`, `avgPrice`, `orderStatus`.

So `NormalizedOrder.filled` should read `cumExecQty` for the aggregate and
`execQty` for a single fill — they are different quantities at different
granularities, and neither is named `filledQty`. Both endpoints agree in shape,
which retires the "pending and history may disagree" question in BUG-0590.

A **filled** order was not observed: the account is empty and no order was
placed. Field presence on an empty list settles the naming, not the semantics
under a partial fill.

## Direction is split the same way in UTA as in V2 Classic

**Documented.** UTA orders carry `side` (direction) and `tradeSide`
(`open` / `close`) as separate fields, plus `posSide` (`long` / `short`) and
`holdMode: "hedge_mode"`.

This matters for BUG-0597, whose acceptance test is "position returns to flat",
not "the request returned 200". The hazard transfers unchanged: a close that
drops `tradeSide` is a valid open. `README.md` records that Classic closes a long
with `side=buy` while UTA closes a long with `side=sell` — the opposite
convention, so the mapping is per-generation and cannot be shared.

## Query ordering before signing — resolved for V3

BUG-0580 asked whether the query must be sorted before signing. Every vendor code
sample sorts; Cachy signs in insertion order.

**Verified on V3**, with a control to prove the signature was actually checked:

| Request | Result |
|---|---|
| wrong secret (control) | HTTP 400, `code=40009` |
| valid secret, insertion order `category=…&symbol=…` | HTTP 200, `code=00000` |
| valid secret, sorted order `symbol=…&category=…` | HTTP 200, `code=00000` |

**Both orders are accepted.** The venue verifies against a canonicalised query,
so the transmitted byte order does not matter and Cachy is correct as written.
The control matters: without it, a `00000` from an endpoint that ignores
signatures would prove nothing.

**Still open for `/api/v2/*`.** The same test against Classic V2 is blocked by
the 40085 gate and needs an account in Classic mode. Do not carry the V3 result
over to V2 — that inference is exactly what BUG-0580 was filed to prevent.

## WebSocket login success is the number `0`

**Verified** against both `wss://ws.bitget.com/v3/ws/private` and
`wss://ws.bitget.com/v2/ws/private`, four connections:

```json
{"event":"login","code":0,"connId":"0621ccff…"}
```

`code` is the JSON **number** `0`. The vendor documents it as the string `"0"`,
and REST uses the string `"00000"`. So all three candidate comparisons fail or
are wrong-typed:

- `code === "00000"` — fails (BUG-0581, live in `bitgetWs.ts`)
- `code === "0"` — also fails, strict equality against a number
- `code === 0` — the only one that matches

**Timestamp unit:** both milliseconds and seconds were accepted, each with a
signature computed over the value sent. The doc contradiction recorded in
`01_sign.md` (prose says ms, Java sample and wire example say seconds) does not
matter for the venue. `01_sign.md:235` calls the asymmetry a permanent trap;
against these two hosts it is not one. Not tested: whether a *wrong* WS signature
is rejected, so this covers valid signatures only.

## Demo trading — the way to test the write path

**Documented**, from `/uta/guide`. Not exercised here.

Bitget offers a demo environment with virtual funds:

- Create a Demo API key: log in → switch to Demo mode → Personal Center →
  API Key Management → Create Demo API Key.
- REST: send the demo key and add header `paptrading: 1`.
- WebSocket: `wss://wspap.bitget.com/v3/ws/public`, `wss://wspap.bitget.com/v3/ws/private`.

This is the answer to "the account is empty, so no order can be placed". It also
means BUG-0597's acceptance test — a close that returns the position to flat —
can run without funding an account.

## Links

- BUG-0581 — the login-code finding above settles its question
- BUG-0589 / BUG-0590 — the traded-amount fields above
- BUG-0580 — ordering, resolved for V3 only
- BUG-0576 — the migration umbrella; this file is the UTA half it did not have

---

**For:** Cachy App - Trade Execution Integration
**File:** `docs/bitget-api/14_uta_v3.md`