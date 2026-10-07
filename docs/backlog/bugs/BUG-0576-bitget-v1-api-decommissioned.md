---
id: BUG-0576
title: "Bitget integration calls the decommissioned V1 API, so every signed REST call fails"
type: bug
status: ready
priority: P0
area: exchange
created: "2026-09-28"
milestone: none
editions: ["community", "pro", "private"]
data_class: none
adr: none
depends_on: []
branch: fix/bitget-v2-market-data
---

# Migrate the Bitget integration from the decommissioned V1 API to V2

> **State note.** Blocked on **IDEA-0620** — the trader test protocol. The code work is landed (see the merged PR for this item's branch); what is missing is live verification against the exchange, which needs a human with API keys. No agent can close that.

## Progress — 2026-10-03: there is a third generation, and Cachy cannot reach it

Credentials were available, and the first signed V2 call returned:

```
40085  You are in Unified Account mode, and the Classic Account API is not
       supported at this time
```

The account is in **UTA** (Unified Trading Account), Bitget's recommended family,
on `/api/v3/*`. UTA is not `/api/v2/mix/*` with a new number — it is regrouped
into `/api/v3/account/*`, `/api/v3/trade/*` and `/api/v3/position/*`,
parameterised by `category` instead of `productType`, with cursor pagination and
a different order envelope.

**This invalidates the premise that a V2 port is the destination.** Bitget marks
UTA as recommended and Classic as the legacy line. A V2 port would be correct for
Classic accounts and dead on arrival for UTA ones, and UTA is where new accounts
land. The plan needs a decision about which generations Cachy supports, not just
a path rewrite.

Facts that survive the choice, verified live:

- **Query ordering does not matter on V3** (BUG-0580). Both orders return
  `00000`, control at `40009`.
- **The WebSocket login code is the number `0`** (BUG-0581) — so `=== "00000"`
  and `=== "0"` both fail.
- **`filledQty` exists in no generation** (BUG-0589, BUG-0590). The fields are
  `cumExecQty` for the aggregate and `execQty` per fill.
- **The 40085 gate is REST-only.** A UTA account opens
  `wss://ws.bitget.com/v2/ws/private` and logs in fine.
- **The `tradeSide` split is not V2-specific.** UTA splits `side` (direction)
  from `tradeSide` (open/close) exactly as V2 does, so BUG-0597's hazard
  transfers — but the convention is mirrored: Classic closes a long with
  `side=buy`, UTA with `side=sell`.

Full evidence: `docs/bitget-api/14_uta_v3.md`.

## Progress — 2026-09-30: market data

**Row 7–9 of the mapping table are done** (branch `fix/bitget-v2-market-data`,
2026-09-30): `market/candles`, `market/ticker` and `market/tickers` run on
`/api/v2/mix/…`. Verified against live unauthenticated V2 responses, recorded
in [`docs/bitget-api/09_v1_vs_v2.md`](../../bitget-api/09_v1_vs_v2.md). Three
findings that the vendor docs do not state: `productType` is required on the
single-symbol ticker as well (`400172` without it); the `_UMCBL` suffix has to
be *stripped* rather than merely not appended, because
`normalizeSymbol(s, "bitget")` still adds it for thirty callers; and the ticker
row renames (`last`→`lastPr`, `volume24h`→`baseVolume`, no
`priceChangePercent` — V2's `change24h` is a fraction) also had to be fixed in
`src/services/api/marketData.ts`, since `routes/api/tickers` forwards Bitget's
payload unparsed.

Two latent bugs in the same code went with it: `fetchBitgetKlines` received a
`limit` argument and never sent it, and its parser tested the Bitget response
*envelope* for being an array, so every successful call reported "no candles"
regardless of endpoint version. The parser also judged `response.ok` before
reading the envelope, which discarded Bitget's error message on every failure —
Bitget pairs each business error with a 400, so every rejection degraded to
"Bitget API error: 400".

**Row 7 is migrated but still not complete.** Two gaps the migration surfaced,
neither of which it caused — both are acceptance criteria below rather than
separate items, because they live in the same function:

- **Thirteen of the twenty timeframes the chart offers fail on Bitget with
  `400171`.** `fetchBitgetKlines` maps eight of them and passes everything else
  through verbatim, and there is no aggregation layer for Bitget:
  `nativeTimeframes` has exactly one consumer, `bitunixNatives` in
  `fetchBitunixKlines`. Verified live against V2 on 2026-09-30: `2m`, `6m`,
  `9m`, `10m`, `12m`, `24m`, `27m`, `45m`, `2h`, `6h`, `8h`, `12h` and `3d` all
  answer `400171 Parameter verification failed k-line time range should be
  [1m,3m,5m,15m,30m,1H,4H,6H,12H,1D,1W,1M,6Hutc,12Hutc,1Dutc,3Dutc,1Wutc,1Mutc]`.
  So this is a live defect, not a missing feature. Two parts of it:
  `bitget.nativeTimeframes` in `src/config/brokerCapabilities.ts` omits
  granularities V2 *does* serve (`3m`, `6H`, `1M`), and the passthrough fails
  on the lowercase H-spellings (`6h`) that the chart uses.
- **A short candle series is indistinguishable from a complete one.** Not
  demonstrated — `limit=1000` on `1m` returns 1000 rows, so the venue fills the
  request and no truncation was reproducible. It is recorded because the
  Bitunix path already treats the opposite as a defect worth a log line
  (`marketData.ts:161`: "a truncated fetch that reports full success is how the
  original defect stayed invisible for so long"), and this path has no such
  signal.

**Rows 1–6 are untouched and still on V1**, deliberately. They need credentials
this pass did not have: the ordering question (BUG-0580) is unanswered, the V2
response shapes for orders/positions cannot be observed without a key, and the
order-schema split must be verified against a real hedge-mode account. Row 1 in
particular must not be ported on a guess — see below.

## Symptom

Every signed REST call Cachy makes to Bitget fails at the venue with

```json
{ "code": "30032", "msg": "The V1 API has been decommissioned. Please migrate to a newer version." }
```

9 of the 10 REST call shapes in `src/utils/server/venues/bitget.ts` use
`/api/mix/v1/…` paths. Only `GET /api/v2/mix/market/contracts` is on V2 — the
BUG-0501 fix, whose own comment already records the fact.

The user-visible consequences, in order of severity:

- **No Bitget order can be placed or closed.** Both go through
  `POST /api/mix/v1/order/placeOrder`.
- **No Bitget account, balance or position data can be read**, so the position
  mirror never populates and the trader sees an empty account.
- **No Bitget market data.** Tickers and every kline come from V1 paths.

The WebSocket is the same story: `wss://ws.bitget.com/mix/v1/stream` is a V1
endpoint, and V2 splits public and private traffic across two hosts.

## Evidence

**Demonstrated** for the deprecation, **derived** for the consequence.

The deprecation is reproducible from any unauthenticated client:

```bash
curl -s 'https://api.bitget.com/api/mix/v1/market/candles?symbol=BTCUSDT_UMCBL&granularity=1m&limit=2'
# {"code":"30032","msg":"The V1 API has been decommissioned. Please migrate to a newer version.","data":null}

curl -s 'https://api.bitget.com/api/mix/v1/market/tickers?productType=umcbl'
# {"code":"30032", …}

curl -s -o /dev/null -w '%{http_code}\n' 'https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES'
# 200

curl -s -o /dev/null -w '%{http_code}\n' 'https://api.bitget.com/api/v2/mix/market/contracts?productType=USDT-FUTURES'
# 200
```

Verified 2026-09-28. The full request set is in
[`docs/bitget-api/09_v1_vs_v2.md`](../../bitget-api/09_v1_vs_v2.md).

That the *signed* calls therefore fail is derived, not observed: `30032` is
returned before any signature is validated, so the credential path is never
reached. The two pieces of code that disagree are the call sites in
`venues/bitget.ts` and the live API's own answer quoted above.

Why it went unnoticed: Bitget's shipped SDK still contains
`v1/mix/order_api.py` posting to `/api/mix/v1/order/placeOrder`, a separate Go
SDK's README still demonstrates V1 with a body matching Cachy's byte for byte,
and archived vendor docs still carry the V1 signing example. Nothing in those
sources signals that the path is dead.

## Cause

Cachy's Bitget integration was written against the V1 API and never migrated
when Bitget retired that generation. BUG-0501 discovered the deprecation while
fixing instrument metadata and migrated exactly one call; the other nine were
left.

The migration is **not** a path rewrite. Four things differ, and the third is a
trap:

1. **Paths and identifiers.** `placeOrder` → `place-order`,
   `allPosition` → `all-position`, `order/current` → `order/orders-pending`,
   `order/history` → `order/orders-history`. `symbol` drops the `_UMCBL`
   suffix, and the helper that existed solely for V1 has since been removed
   rather than extended — **done, see BUG-0599**: `normalizeSymbol` now strips
   the suffix instead of appending it and no longer branches on the venue.
   `productType`
   changes from `umcbl` to `USDT-FUTURES`. The V1 misspelling
   `timInForceValue` becomes `force` with a different value set.

2. **Two new required fields.** `place-order` requires `productType` *and*
   `marginMode` (`isolated` | `crossed`). Cachy sends neither today.

3. **The order schema split.** In V1 a single `side` field carries both
   direction and open-versus-close: `open_long`, `open_short`, `close_long`,
   `close_short`. In V2, `side` carries position direction only and a new
   `tradeSide` field carries the close.

   The correct port decomposes the V1 value losslessly — `close_long` becomes
   `side: buy` + `tradeSide: close` — but **`tradeSide` is the field carrying
   the close, so a port that drops it does not fail.** It sends a valid open
   long. The order succeeds, the position doubles instead of flattening, and
   the only signal is the size. This is why the acceptance test is "position
   returns to flat", not "request returned 200".

4. **Response shapes are unknown.** V1 is no longer documented, so the parsers
   in `venues/bitget.ts` were written against a shape nobody can now observe.
   V2 order endpoints return `data: {orderId, clientOid}` for place and cancel
   and add `endId` pagination to the list endpoints, so a parser iterating
   `data` directly will need rework. This is the largest unknown.

Additionally, the WebSocket moves from one socket to two, and `instType` moves
from the V1 value `mc` to `USDT-FUTURES`. Cachy's single-socket design is
explicitly justified in `bitgetWs.ts` — *"single socket, shared fate"* — so
this is a lifecycle change, not a URL swap, and should not be bundled with the
REST port.

## Fix

**One unresolved question blocks the plan, and it is cheap to settle.**

Bitget's documentation says query parameters must be sorted alphabetically
before signing — every code sample on the signature page sorts, and both worked
examples come out alphabetical. Cachy signs them in **insertion order**:
`signBitgetRequest` uses `new URLSearchParams(params).toString()`, and
`src/utils/exchange/restSigningPlan.ts:202` explicitly forbids applying the
sorted comparator to a Bitget route.

This cannot be settled from the docs (they contradict Cachy) and cannot be
settled against V1 (rejected before signature validation). It must be settled
with one signed `GET` against V2 in a sandbox. **Assume sorted is correct and
the insertion-order behaviour is a latent bug affecting every Bitget read** —
but do not let a code review decide it.

Then, in dependency order:

1. **Read paths** (rows 2, 3, 5, 6, 7, 8, 9 in the mapping table): path and
   identifier remaps. Establish each V2 response shape with a live call and
   record what actually arrives before rewriting the parser. Mechanical once
   the ordering question holds.
2. **Read the position mode, from the response Cachy is already parsing.**
   `GET /api/v2/mix/account/account` (row 5) returns `posMode` —
   `one_way_mode` | `hedge_mode` — directly beside `marginMode` in the same
   object. `fetchBitgetAccount` already parses five fields out of that payload
   and simply does not read `posMode`. This is the only step here that needs no
   new endpoint, and it is not optional: **the V2 order schema is
   mode-dependent**, so step 3 cannot pick a request shape without it. The
   error-code table makes the coupling concrete — `22042` rejects a reduce-only
   trigger order in one-way mode, `45021` requires the order type to match the
   position type in one-way mode, and `45020` refuses liquidation outside
   two-way mode. So: add `posMode` to the parsed account data, declare
   `positionModes: ["one_way", "hedge"]`, and let the existing
   `accountState.positionMode` path carry it to the UI the way it already does
   for Bitunix.
3. **Write paths** (rows 1, 4), with the order-schema split done deliberately
   against a real **hedge-mode** account.
4. **WebSocket split**, as its own change: two sockets, two lifecycles, the
   `instType` rename.
5. **Re-verify the remaining capability flags** against V2's actual support. At
   minimum `tpSlAtEntry` gains a verified shape (`presetStop*` on `place-order`,
   which answers BUG-0503).

**Leave alone.** The refusal design. Cancelling a Bitget order, reading TP/SL
or changing leverage must keep failing loudly at the signer before a request
exists, until each has a verified request shape. Per BUG-0001, no step may be
completed against a guessed wire format.

**Adjacent, worth resolving in the same pass.** The WebSocket order and
position pushes carry Bitget field names (`size`, `status`, `filled`) while
`accountState.updateOrderFromWs` / `updatePositionFromWs`
(`src/stores/account.svelte.ts:68`, `:157`) read Bitunix names (`qty`,
`orderStatus`, `dealAmount`, `positionId`, `ctime`), so a newly opened Bitget
position is never added to `accountState.positions` via the socket. Tracked in
[`docs/TODO.md`](../../TODO.md). Fixing the field names without re-checking V2
risks reintroducing it.

## Acceptance criteria

- [ ] The query-parameter ordering question is settled by a signed V2 `GET` in
      a sandbox, and the result is recorded in
      [`docs/bitget-api/01_sign.md`](../../bitget-api/01_sign.md)
- [ ] A test reproduces the defect and fails without the fix — an integration
      test asserting that no `/api/mix/v1/` path appears in the Bitget path
      table, which fails today
- [ ] Every REST call shape in `venues/bitget.ts` and `bitgetUpstreamPath`
      (`src/utils/exchange/restSigningPlan.ts:272`) is on `/api/v2/mix/…`
- [x] `src/utils/symbolUtils.ts` no longer appends `_UMCBL` — shipped in BUG-0599
- [ ] `place-order` sends `productType` and `marginMode`; no request body
      contains `timInForceValue`
- [ ] `fetchBitgetAccount` parses `posMode` out of the account response, and
      `bitgetCapabilities.positionModes` declares `["one_way", "hedge"]` — with
      the mode reaching the UI through the existing `accountState.positionMode`
      path, as it already does for Bitunix
- [ ] A close placed on a **hedge-mode** account returns the position to flat,
      verified in a sandbox — not merely a `200` response
- [ ] One-way mode is handled explicitly, since `tradeSide` is ignored there
- [ ] Response parsers are written against shapes observed in a live V2 call,
      with the observed payloads recorded
- [ ] The WebSocket connects to both `/v2/ws/public` and `/v2/ws/private`, sends
      `instType: "USDT-FUTURES"`, and survives the venue's 24-hour forced
      disconnect
- [ ] The test passes with the fix
- [ ] `bitgetCapabilities.tpSlAtEntry` is re-evaluated against V2, with a test
      added *before* the value is flipped
- [ ] [`docs/bitget-api/INTEGRATION_STATUS.md`](../../bitget-api/INTEGRATION_STATUS.md)
      no longer contains a ☠️ row
- [ ] The WebSocket field-name mismatch in `docs/TODO.md` is resolved or
      re-confirmed
- [ ] Every timeframe the chart offers resolves on Bitget — mapped onto a
      granularity V2 serves, aggregated from one it does (the way
      `fetchBitunixKlines` uses `bitunixNatives`), or refused explicitly rather
      than letting `400171` escape as a chart error. `bitget.nativeTimeframes`
      names what Bitget really serves: `3m`, `6H` and `1M` are absent from it
      today although V2 answers `00000` for each
- [ ] A test covers a non-mapped timeframe on the Bitget path, and the list in
      [`CandleChartView.svelte:109`](../../../src/lib/windows/implementations/CandleChartView.svelte)
      is reconciled with what Bitget can serve
- [ ] A short candle series is observable rather than silent: when the venue
      returns fewer rows than requested, that is logged the way the Bitunix
      path logs it, instead of being reported as a complete fetch

## Links

- FEAT-0525 — the reference this migration needs; filed alongside it
- BUG-0501 — the deprecation was found here; migrated one call out of ten
- BUG-0514 — the bulk-close question; the native endpoint is V1 and unreachable
  until this is fixed
- BUG-0503 — the unprotected window; V2's `presetStop*` on `place-order` is the
  answer, and it needs this migration first
- BUG-0001 — never guess an exchange's wire format for a call that moves money
- [`docs/bitget-api/09_v1_vs_v2.md`](../../bitget-api/09_v1_vs_v2.md) — the
  field-by-field delta and the hazard
