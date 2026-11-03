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
request body next to the error. That body carries symbol, size, entry price,
leverage and order type — Class A trade data — and the log event is available
over the `LOG_STREAM_KEY`-protected SSE stream.

## Evidence

**Derived, with a failing test in the fix.** No incident observed.

- `src/routes/api/orders/+server.ts:199-205` passed `body` to
  `logger.error`.
- `src/lib/server/logger.ts` forwards the data object into the log event;
  `/api/stream-logs` serves the same stream when the operator enabled it.
- ADR-0001 forbids Class A data in logs ("not even … debug logs"), regardless
  of who can read the stream.

## Cause

The catch block was written as "enhanced logging" before the Class A boundary
covered logs. The body was convenient there because the error path already had
it.

## Fix

- Log only the action (`payload.type`), the venue and the exchange error code.
- Leave the request body and the upstream error text out of the log event; the
  client still receives the scrubbed message.
- Pin it with a test that fails an order and asserts the log context has no
  `body`, no `error`, and no symbol or order id.

## Acceptance criteria

- [x] The order failure log event carries `payload.type`, `exchange` and
      `errorCode`, and no request body.
- [x] A test fails an order and asserts `BTCUSDT` and the order id are absent
      from the log context.
- [x] The client-facing error path is unchanged (same status and scrubbed
      message).
- [x] Targeted order-route tests are green.

## Out of scope

- Other routes' logging. The audit found this body leak on the order route
  only.
- Changing the SSE log stream itself or its `LOG_STREAM_KEY` guard.

## Links

- Audit: `~/.local/state/cachy-audit/2026-11-03/w2-security.md` (W2-02)
- ADR-0001 — Local-First boundary
