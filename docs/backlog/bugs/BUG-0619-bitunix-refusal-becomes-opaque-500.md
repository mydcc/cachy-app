---
id: BUG-0619
title: A Bitunix refusal arrives as an opaque HTTP 500 because the venue reads the response status before the envelope
type: bug
status: done
priority: P1
area: exchange
created: "2026-10-04"
milestone: none
editions: [community, pro, private]
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: fix/bitunix-venue-error-propagation
---

# BUG-0619 — A Bitunix refusal arrives as an opaque HTTP 500

The Bitunix half of BUG-0604, which fixed the Bitget half and left this one
explicitly open. Fixed in `fix/bitunix-venue-error-propagation`.

## Symptom

Every signed Bitunix call that the venue refuses answers the browser with a
blanket **HTTP 500** and a message that says nothing about why: wrong key,
revoked permission, bad parameter, exchange-side fault — all identical, all
`INTERNAL_ERROR`.

## Evidence

**Derived**, from reading the code — the same shape BUG-0604 demonstrated live
on Bitget. Bitunix answers `{code, msg, data}` with `code: 0` on success and
pairs a business failure with a non-2xx status, and twelve call sites in
`src/utils/server/venues/bitunix.ts` tested `response.ok` before reading the
envelope:

```ts
if (!response.ok) throw new Error(`${ORDER_ERRORS.BITUNIX_API_ERROR}: ${response.status}`);
const text = await response.text();
const res = safeJsonParse(text) as BitunixResponse<...>;
if (String(res.code) !== "0") throw new Error(`Bitunix error: ${res.code}`);
```

The first throw fires on every refusal and carries only the HTTP status; the
second, which has the venue's code, is never reached for a 4xx — and drops
`msg` even when it is reached. Neither matches any branch in `handleApiError`,
so both fall through to `jsonError(message, "INTERNAL_ERROR", 500)`.

## Cause

Status-before-envelope, in twelve functions: `placeBitunixOrder`,
`cancelBitunixOrder`, `cancelAllBitunixOrders`, `closeAllBitunixPositions`,
`flashCloseBitunixPosition`, `modifyBitunixOrder`, `fetchBitunixOrderDetail`,
`fetchBitunixPendingOrders`, `fetchBitunixHistoryOrders`, `fetchBitunixAccount`,
`fetchBitunixBalance`, `fetchBitunixPositions` — plus the klines retry path and
`postBitunixAccount`, which had the same ordering with their own special cases.

## Fix

The `assertBitunixOk` / `bitunixVenueError` pair in `venues/bitunix.ts`, mirroring
the Bitget half:

1. Read the envelope first; throw with the venue's code and message attached as
   `venueCode` / `venueMessage` (deliberately not `ExchangeError.code`, which
   carries a translation key the UI resolves).
2. The client is told **502 `UPSTREAM_REJECTED`**, never the venue's own status:
   relaying it would hand a browser a 4xx for a request Cachy got wrong at the
   exchange. The venue's real status stays on the error as `venueHttpStatus`.
3. `handleApiError` needed no change — BUG-0604's `venueRejection` branch
   already answers 502 for any error carrying `venueCode`.

Preserved, deliberately:

- The cancel 400/404 swallow (idempotent cancel: already filled or cancelled
  reads as success). Status-based, unchanged; narrowing it to venue codes would
  change cancel semantics.
- The klines retry loop and the code-2 → 404 "Symbol not found" mapping.
- The account-setting guarantee: a documented precondition refusal ("not while
  a position or order is open") still becomes an error, never a silent success.

Changed, and worth knowing:

- `placeBitunixOrder` and `postBitunixAccount` no longer set
  `error.code` to the venue's code. No client branches on venue codes from the
  server proxy (only on route-generated keys like `VALIDATION_ERROR`), and the
  venue code travels in the message and in `details` instead.

## Acceptance criteria

- [x] A Bitunix refusal carries the venue's `code` and `msg`
- [x] A refusal is not a 500, and never a 200
- [x] A well-formed success is not rejected (guards against over-rejection)
- [x] A response with no readable envelope still fails loudly
- [x] The cancel 400/404 idempotency is unchanged
- [x] The klines code-2 → 404 mapping is unchanged
- [x] RED verified: 5 of 7 new cases fail against the unmodified venue module
      (the 2 success guards pass both ways, as they should)

## Out of scope

- The client-side direct-to-Bitunix path in `tradeService.ts`, which already
  reads the envelope first. Different layer, already correct.
- A per-code taxonomy. Same call as BUG-0604: a UX decision, not an
  error-mapping one.

## Links

- BUG-0604 — the Bitget half; `area: exchange`, same helper shape
- `src/utils/server/venues/bitunix.ts` — `assertBitunixOk`, `bitunixVenueError`
- `src/utils/apiResponse.ts` — `handleApiError`, `venueRejection` (unchanged)
