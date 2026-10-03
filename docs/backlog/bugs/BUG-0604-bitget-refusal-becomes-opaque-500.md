---
id: BUG-0604
title: A Bitget refusal arrives as an opaque HTTP 500 because the venue reads the response status before the envelope
type: bug
status: done
priority: P1
area: exchange
created: "2026-10-03"
milestone: none
editions: ["community", "pro", "private"]
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: fix/bitget-venue-error-propagation
---

# A Bitget refusal must reach the client as a refusal

Found while attempting a Bitget login on `dev.cachy.app`, which produced
`POST /api/positions 500 (Internal Server Error)` with nothing else. Fixed in
`fix/bitget-venue-error-propagation`.

## Symptom

Every signed Bitget call that the venue refuses answers the browser with a
blanket **HTTP 500** and a message that says nothing about why. The response
body is `{"code":"30032", …}` with a plain-English explanation, and it is
discarded before it reaches anyone.

The three causes a user or a support log most needs to tell apart all look
identical:

| What actually happened | What the client sees |
|---|---|
| Bitget decommissioned the endpoint Cachy called | 500 `INTERNAL_ERROR` |
| The account is on the other Bitget API family | 500 `INTERNAL_ERROR` |
| The API key is wrong, revoked or lacks permission | 500 `INTERNAL_ERROR` |
| A parameter is wrong — often a bug in Cachy | 500 `INTERNAL_ERROR` |

## Cause

Bitget pairs a business failure with a non-2xx HTTP status. Verified live,
signed, against `api.bitget.com` on 2026-10-03:

```
GET /api/mix/v1/position/allPosition?productType=USDT-FUTURES&marginCoin=USDT
  -> HTTP 400 {"code":"30032","msg":"The V1 API has been decommissioned. …"}

GET /api/v2/mix/position/all-position?productType=USDT-FUTURES&marginCoin=USDT
  -> HTTP 400 {"code":"40085","msg":"You are in Unified Account mode, and the
              Classic Account API is not supported at this time"}
```

So `venues/bitget.ts` tested `response.ok` **before** reading the envelope, and
threw on the status alone:

```ts
if (!response.ok) throw new Error("Bitget API Error");
const res = safeJsonParse(text);          // never reached for a 4xx
if (res.code !== "00000") throw new Error(res.msg);
```

`"Bitget API Error"` matched no branch in `handleApiError`, carried no upstream
status, and fell through to `jsonError(message, "INTERNAL_ERROR", 500)`.

`fetchBitgetKlines` already avoided this and its comment says why — it reads
the envelope first. The other seven call sites did not.

The behaviour was also inconsistent between branches of the same function: a
non-ok response produced the translation key `bitunixErrors.BITGET_API_ERROR`,
while a `200` carrying a business code produced raw English vendor prose. So the
German UI was already reachable via one path and not the other.

## Blast radius

Eight Bitget functions read the status first:

`placeBitgetOrder`, `cancelBitgetOrder`, `fetchBitgetPendingOrders`,
`fetchBitgetHistoryOrders`, `fetchBitgetAccount`, `fetchBitgetBalance`,
`fetchBitgetPositions` — and, in the same shape, eleven Bitunix functions
(`placeBitunixOrder`, `cancelBitunixOrder`, `cancelAllBitunixOrders`,
`closeAllBitunixPositions`, `flashCloseBitunixPosition`, `modifyBitunixOrder`,
`fetchBitunixOrderDetail`, `fetchBitunixPendingOrders`,
`fetchBitunixHistoryOrders`, `fetchBitunixAccount`, `fetchBitunixBalance`,
`fetchBitunixKlines`).

**This PR fixes the Bitget half only.** The Bitunix eleven are unchanged and
still collapse into 500.

## Fix

1. `ExchangeError` gains `venueCode`, `venueMessage` and `venueHttpStatus`.
   `venueCode` is deliberately *not* the existing `code` field: that one carries
   a translation key the UI resolves, and overwriting it with vendor prose would
   leave the German UI untranslatable.
2. One `assertBitgetOk(response, text)` helper in `venues/bitget.ts` reads the
   envelope first and throws with the venue's code and message attached. The
   status check stays as the fallback for a body that is not a readable
   envelope, so a truncated response still fails loudly.
3. `handleApiError` answers **502 `UPSTREAM_REJECTED`** with the venue's code
   and message in `details`. It runs *before* the `upstreamErrorStatus` branch,
   because the error also carries a status and a refusal must not reach a
   browser as the exchange's own 4xx.
4. The venue's HTTP status is **not** relayed. Bitget pairs a business error with
   a 4xx *and* reports some on a `200`; relaying blindly answers a browser with
   400 for a request Cachy got wrong at the exchange, or with 200 carrying an
   error body. It is kept on the error as `venueHttpStatus` for diagnosis.

The hedge-mode hint on the order-placement path is preserved and now keys off
the venue's own message rather than the raw body.

## Acceptance criteria

- [x] A Bitget refusal carries the venue's `code` and `msg`, proven against the
      real `30032` and `40085` bodies
- [x] A refusal is not a 500, and never a 200
- [x] A well-formed success is not rejected (guards against over-rejection)
- [x] A response with no readable envelope still fails loudly
- [x] The translation-key contract is unchanged — `error.code` still resolves
      in the locale files
- [x] RED verified: 6 of 7 new cases fail against the unmodified venue module

## Out of scope

- The eleven Bitunix call sites. Same shape, same fix, separate PR — the shared
  helper is the pattern.
- A per-code taxonomy. `30032` and `40085` are both 502 today; distinguishing
  "the exchange retired this" from "your key is wrong" in the UI is worth doing
  but is a UX decision, not an error-mapping one.
- BUG-0576. The V1 paths this surfaces are the migration's subject; this item
  makes them legible, it does not replace them.

## Links

- BUG-0576 — the migration that produces most of these refusals
- `src/utils/server/venues/bitget.ts` — `assertBitgetOk`, `bitgetVenueError`
- `src/utils/apiResponse.ts` — `handleApiError`, `venueRejection`
- `docs/bitget-api/14_uta_v3.md` — the `40085` gate, and why it fires before the
  signature check