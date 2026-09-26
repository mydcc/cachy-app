---
id: BUG-0551
title: Account or mode changes during signing can dispatch to the old live context
type: bug
status: done
assignee: opencode
branch: fix/bug-0551
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

- [x] A deferred signing test switching live to paper produces no network request.
- [x] Switching accounts during signing produces no request to the old account.
- [x] Switching providers during signing produces no request to the old provider.
- [x] An unchanged session still dispatches normally.
- [x] The refusal/audit records the session or mode mismatch.
- [x] Existing bot paper-only provenance behavior remains intact.

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

## State

Done on branch `fix/bug-0551` (assignee: opencode).

## What shipped

Shipped in 1.6.0-beta.364.

The dispatch is guarded rather than the whole transport: `signedRequest` keeps
the context it resolved into one object, hands the same object to
`assertGatePass` and to `dispatchUnderSession`, and the guard runs as
`appFetch`'s per-attempt hook — the last synchronous step before a byte leaves
the device. Two layers, because they fail differently: the `accountEpoch`
session token catches a rotation whose fields came back unchanged, and
re-reading provider, account id, key fingerprint and paper/live mode catches a
`settingsState` write that never rotated one. The refusal names the field that
moved (`exchange`, `mode`, `account`) under a new `orderGate.sessionChanged`
message, and the un-nameable rotation gets its own `orderGate.sessionRotated`
rather than a field and an internal counter. The gate's existing
`OrderRefusedError` handling records both in the audit trail.

Two boundaries, both deliberate:

- **Reads keep their exact behaviour.** `mutatingActionOf` decides. The
  leverage, position-mode and account reads take a read-order ticket and drop a
  late answer at the store write (`accountReadOrder`, BUG-0412/BUG-0419); the
  two position-list reads do not, and BUG-0419 owns that gap. Refusing reads
  here would turn every account switch into an error in the polling paths for
  no safety gain.
- **`/api/account-settings` got the same guard.** It signs and dispatches on
  its own, never through `signedRequest`, and carried the identical gap — its
  paper guard at the top of the lane cannot see a switch that happens while
  the signature is being computed. Switching a live account to ONE_WAY while
  the UI shows paper is the same deception as an order.

Review finding folded in: signing is not the last await in the dispatch path.
`appFetch` waits for the token restore, may issue a token, and on a
client-token 401 issues another and tries again — and that retry is the attempt
that reaches the venue, through a window wider than the signing await. The
check therefore rides a `beforeAttempt` hook that runs before *every* attempt
rather than wrapping the call once.

