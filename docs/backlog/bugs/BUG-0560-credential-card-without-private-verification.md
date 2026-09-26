---
id: BUG-0560
title: Credential cards show green without private-account verification
type: bug
status: ready
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

## Acceptance criteria

- [ ] Bogus nonempty credentials never produce a verified green state.
- [ ] Verification is account-specific and key edits return the state to stale/unverified.
- [ ] Public WebSocket connected plus private account failed displays both states accurately.
- [ ] Live order entry is disabled or clearly blocked while private account state is unknown or stale.
- [ ] Paper mode does not require exchange credentials.
- [ ] Tests cover unconfigured, verifying, verified, rejected, stale, and edit transitions.

## Out of scope

- Credential storage encryption and device-key loss covered by BUG-0053.
- Public market WebSocket connection status.
- New authentication protocols.

## Links

- `src/components/settings/AccountCard.svelte:58-65`
- `src/components/settings/AccountCard.svelte:93-103`
- `src/components/shared/ConnectionStatus.svelte:22-55`
- `src/components/results/PlaceOrderPanel.svelte:171-178`
- Existing coverage: BUG-0059; it fixed swallowed account-fetch errors but not a trustworthy credential verification state.
