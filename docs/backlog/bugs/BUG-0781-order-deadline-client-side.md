---
id: BUG-0781
title: Order submission has no client-side deadline; a half-open link leaves "Submitting" for minutes
type: bug
status: done
priority: P1
milestone: none
editions: [community, pro, private]
area: execution
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: fix/order-deadline
---

# BUG-0781 — Order submission has no client-side deadline (PA-01)

## Symptom

`exchangeSignedFetch` accepts a `signal`, but no money path sets one. On a
half-open mobile link the order request hangs until the browser's own network
timeout (minutes), `submitting` stays true, the order-gate fingerprint stays
blocked, and after the eventual failure it is unclear whether the order
reached the exchange — a retry can open a second position.

## Evidence

Derived — `src/utils/exchange/browserSigning.ts` (`exchangeSignedFetch`'s
`signal` option) and `src/services/tradeService.ts` (`signedRequest` never
passes one). The server already caps the upstream call at 8 s via
`fetchWithTimeout`; the browser-to-node leg does not.

## Cause

No client deadline on the money path. Fix: pass `AbortSignal.timeout(15_000)`
on mutating actions, surface the abort as "status unknown" (do not retry),
reconcile open orders/positions, and tell the trader.

## Fix

- `signedRequest` passes the deadline only when `mutatingActionOf(...) !== null`.
- An abort (`AbortError`/`TimeoutError`) throws `OrderStatusUnknownError`.
- `gatedRequest` reconciles on any transport failure except a gate refusal.
- `orderPlacementService` and `PlaceOrderPanel` surface `orderEntry.errors.statusUnknown`.
- i18n keys added (en/de) and `schema.d.ts` regenerated.

## Verification

- `bash scripts/run-lowpri.sh npx vitest run --project=unit src/services/tradeService src/services/trade/placeOrder src/services/orderPlacementService src/components/results/PlaceOrderPanel` — green.
- `npx svelte-check` — 0 errors.

## Known follow-ups

- Close/cancel/modify/flash-close UI surfaces still show a generic error on
  status-unknown; the transport-level deadline and reconciliation apply to all
  of them.
- Reconciliation UX ("check your open orders") is a one-line toast today.
