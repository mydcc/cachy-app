---
id: BUG-0268
title: Bitget history errors return an empty list indistinguishable from no orders
type: bug
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: api
data_class: none
adr: none
depends_on: []
---

# BUG-0268 — Bitget history errors return an empty list indistinguishable from no orders

## Symptom

`fetchBitgetHistoryOrders` (`src/routes/api/orders/+server.ts`, ~995–1010) returns
`[]` both on `!response.ok` and on exchange error codes — indistinguishable from
"no orders". Sibling Bitunix helpers throw properly. Key/permission/network errors
render as "you have no history"; the user believes data was lost or sync is complete.

## Evidence

**Derived** — from reading the handler and contrasting it with the Bitunix paths'
error handling in the same file.

## Cause

Error mapping was written per venue; the Bitget branch chose the quiet path.

## Fix

Throw (or return a typed partial-result flag) like the Bitunix paths do, so the UI
shows a retryable error state instead of an authoritative-looking empty list.

## Acceptance criteria

- [x] A test with a non-OK response and a test with an exchange error body assert
      neither resolves to `[]` — failing before the fix
- [x] A genuinely empty history still resolves to `[]` (test)
- [x] UI surfaces a retryable error for the failure cases

## Out of scope

Timeout handling ([`BUG-0267`](BUG-0267-exchange-fetch-timeouts.md)). Sync logic changes.

## Links

- `src/routes/api/orders/+server.ts`
- Security audit 2026-08-23, finding "silent failure masquerades as empty history" (Medium)

## What shipped

Shipped in 1.6.0-beta.126.
