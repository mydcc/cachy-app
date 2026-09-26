---
id: BUG-0560
title: Credential cards show green without private-account verification
type: bug
status: in-progress
assignee: opencode
branch: fix/bug-0560
priority: P1
milestone: none
editions: [community, pro, private]
area: security
data_class: A
adr: none
depends_on: []
---


# BUG-0560 — Credential cards show green without private-account verification

## Symptom

Any nonempty key/secret can make an account card appear configured and green even when the exchange rejects it. Public market connectivity is presented separately, and the order surface can appear enabled before private account state is known.

## Evidence

**Derived.** `src/components/settings/AccountCard.svelte:58-65` defines configured state solely from nonempty key, secret, and optional passphrase, then renders that predicate as a green status dot at `:93-103`. `src/components/shared/ConnectionStatus.svelte:22-55` reflects public market WebSocket state, not private account authentication or account-read health. `src/components/results/PlaceOrderPanel.svelte:171-178` enables the order button from calculator/metadata state without requiring verified private-account state.

## Cause

Credential presence, public connectivity, and private account verification are represented as if they were one connection state.

## Fix

Use a tri-state/private-account lifecycle: unconfigured, verifying, verified, rejected, and stale. Verify with a least-privilege signed account read, track freshness, distinguish public market connectivity from private account connectivity, and block live entry while private state is unknown or stale. Paper mode must remain credential-free.

## What shipped

The signal already existed and was almost unreadable. `PositionsSidebar` keeps
a local `errorAccount` from its `/api/account` read and shows it in
`AccountSummary` — a real private-account answer that the settings card, the
order panel and any trader with the sidebars hidden could not see. So the fix
promotes that answer to account-scoped shared state rather than building a
second, parallel mechanism.

- `src/stores/accountVerification.svelte.ts` — per-account record
  (`unconfigured` / `verifying` / `verified` / `rejected` / `stale`), the
  venue's error code, and a `failure` discriminator that keeps "the exchange
  refused these credentials" apart from "the exchange never answered". A
  verdict is bound to a display-grade `credentialFingerprint` of the three
  credential fields, so an edit returns the account to `stale` before anything
  refetches. `stale` is also derived from a five-minute freshness window, so no
  verdict stays green by sitting still.
- `PositionsSidebar` records the verdict of the read it already performs
  (`claimVerification` + `recordSuccess` / `recordFailure`, released in a
  `finally` so a coalesced or superseded read cannot wedge the account).
- `verifyAccount()` is the fallback read for the two cases where no report is
  coming: the sidebars are hidden (`PositionsSidebar` renders only under
  `showSidebars`) or the trader never opens the positions panel. Same signed
  `/api/account` path, the account's own credentials, no order placed. It drops
  its own verdict if the session rotated or a newer read already landed.
- `AccountCard` shows green only for `verified`; `verifying` and `stale` are
  amber, `rejected` is red, and every state carries an accessible name.
- `PlaceOrderPanel` disables live entry while the state is unknown or stale and
  says why. `PlaceOrderPanel` is mounted unconditionally by the app shell, so
  its `ensureCurrent()` effect is the app-lifecycle trigger — no polling timer.
- `resetAccountSession` invalidates every verdict, so switching accounts and
  back does not find the previous account's green dot waiting.

Two boundaries, both deliberate: paper mode never consults the store (AC5), and
a `rejected` credential is left to the gate, which can name the venue's own
reason where the panel could only say "unverified".

## Acceptance criteria

- [x] Bogus nonempty credentials never produce a verified green state.
- [x] Verification is account-specific and key edits return the state to stale/unverified.
- [x] Public WebSocket connected plus private account failed displays both states accurately.
- [x] Live order entry is disabled or clearly blocked while private account state is unknown or stale.
- [x] Paper mode does not require exchange credentials.
- [x] Tests cover unconfigured, verifying, verified, rejected, stale, and edit transitions.

## Out of scope

- Credential storage encryption and device-key loss covered by BUG-0053.
- Public market WebSocket connection status.
- New authentication protocols.

## Links

- `src/components/settings/AccountCard.svelte:58-65`
- `src/components/settings/AccountCard.svelte:93-103`
- `src/components/shared/ConnectionStatus.svelte:22-55`
- `src/components/results/PlaceOrderPanel.svelte:171-178`
- `src/stores/accountVerification.svelte.ts` — the verdict store
- `src/services/accountSession.svelte.ts` — verdict invalidation on rotation
- Existing coverage: BUG-0059; it fixed swallowed account-fetch errors but not a trustworthy credential verification state.
