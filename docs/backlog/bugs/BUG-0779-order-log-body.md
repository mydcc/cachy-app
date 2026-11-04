---
id: BUG-0779
title: Order failure log includes the full trade body
type: bug
status: in-progress
priority: P1
milestone: none
editions: [community, pro, private]
area: security
data_class: A
adr: ADR-0001
depends_on: []
assignee: opencode
branch: fix/orders-log-body
---

# BUG-0779 — Order failure log includes the full trade body

## Symptom

When an order request fails, `POST /api/orders` logs the complete validated
request body next to the error. That body carries the symbol, the quantity
(`qty`), price/trigger price and order type — Class A trade data — and the log
event is available over the `LOG_STREAM_KEY`-protected SSE stream.

## Evidence

**Derived, with a failing test in the fix.** No incident observed.

- `src/routes/api/orders/+server.ts:201-205` passed `body` to
  `logger.error`.
- `src/lib/server/logger.ts` forwards the data object into the log event;
  `/api/stream-logs` serves the same stream when the operator enabled it.
- ADR-0001 forbids Class A data in logs ("including telemetry, crash reports
  and debug logs"), regardless of who can read the stream.

## Cause

The catch block was written as "enhanced logging" before the Class A boundary
covered logs. The body was convenient there because the error path already had
it. The venue's per-order failure path also threw a bare `Error`, so the only
diagnostic field the route could log was the (usually absent) `code`.

## Fix

- Log only the action (in the message), the venue, and non-sensitive
  diagnostic fields: `code`, `venueCode`, `venueHttpStatus`, `status` and the
  error class. Drop `undefined` keys so the stream carries no empty fields.
- Attach the venue's business code in `cancelBitunixOrder` so a per-order
  failure does not arrive as a bare `Error`; the client status stays 500.
- Leave the request body and the upstream error text out of the log event; the
  client still receives the scrubbed message.
- Pin it with a test that fails an order and asserts the positive fields as
  well as the absence of `body`, `error`, the symbol and the order id.

## Acceptance criteria

- [x] The order failure log event carries the action in the message, the
      venue, and a non-sensitive diagnostic code (`code`/`venueCode`), and no
      request body.
- [x] A test fails an order and asserts those fields are present and
      `BTCUSDT`/the order id are absent.
- [x] The client-facing error path is unchanged (same status and scrubbed
      message).
- [x] Targeted order-route tests are green.

## Out of scope

- Other routes' logging. The audit found this body leak on the order route
  only.
- Changing the SSE log stream itself or its `LOG_STREAM_KEY` guard.
- Pre-existing issues found while reviewing this route, tracked separately:
  `cancelBitunixOrder` treats a 400 as "already gone" (only 404 is safe); an
  unknown exchange answers 200 `null`; a missing signing plan answers 500
  without a log; credentials of length <= 3 skip the response scrub.

## Links

- Audit 2026-11-03, W2-02 (`w2-security`)
- ADR-0001 — Local-First boundary
