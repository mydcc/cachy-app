---
id: BUG-0551
title: Account or mode changes during signing can dispatch to the old live context
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: security
data_class: A
adr: none
depends_on: []
---

# BUG-0551 — Account or mode changes during signing can dispatch to the old live context

## Symptom

A live request can still reach the previously selected provider or account if the user switches mode, account, or exchange while signing is awaiting completion. The dangerous live-to-paper case can make the UI appear simulated while the already-selected live branch dispatches the write.

## Evidence

**Derived.** `src/services/tradeService.ts:172-226` checks account/provider/mode and selects the paper/live branch before the asynchronous signing boundary. `src/utils/exchange/browserSigning.ts:332-364` awaits signing before `fetchFn`. `src/services/paperTradingService.ts:205-230` rotates mode/account state and clears shared stores but does not abort a selected write. `src/stores/settings.svelte.ts:616-627` changes account state without invalidating an in-flight signing context.

## Cause

The preflight context is checked before the last asynchronous boundary, but no session epoch or final context revalidation exists immediately before network dispatch.

## Fix

Capture a session/account epoch and revalidate provider, account, and paper/live mode after signing and before `fetchFn`. Abort or refuse the request when the epoch changes, while preserving existing bot paper-only provenance checks.

## Acceptance criteria

- [ ] A deferred signing test switching live to paper produces no network request.
- [ ] Switching accounts during signing produces no request to the old account.
- [ ] Switching providers during signing produces no request to the old provider.
- [ ] An unchanged session still dispatches normally.
- [ ] The refusal/audit records the session or mode mismatch.
- [ ] Existing bot paper-only provenance behavior remains intact.

## Out of scope

- Cancelling a request after network dispatch.
- Venue-side idempotency.
- Late read-response ordering covered by BUG-0419.

## Links

- `src/services/tradeService.ts:172-226`
- `src/utils/exchange/browserSigning.ts:332-364`
- `src/services/paperTradingService.ts:205-230`
- `src/stores/settings.svelte.ts:616-627`
- Existing coverage: BUG-0419, BUG-0494; neither covers a manual write crossing the asynchronous signing boundary.
