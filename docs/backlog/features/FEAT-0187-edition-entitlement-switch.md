---
id: FEAT-0187
title: Replace the cheat code with a verifiable local entitlement
type: feature
status: specced
priority: P2
milestone: M5
editions: [community, pro, private]
area: build
data_class: A
adr: none
depends_on: [FEAT-0014]
estimate: 3
size: M
---

# FEAT-0187 — Replace the cheat code with a verifiable local entitlement

## Problem

The only mechanism separating the editions at runtime is a secret knock:
`PowerToggle.svelte` listens for a 5-character cheat code (SHA-256-compared,
`src/components/shared/PowerToggle.svelte:24`), which flips
`settingsState.isProLicenseActive`; a footer toggle then flips
`settingsState.isPro`. That was the right pragmatic tool for one maintainer
and a few initiated users. It does not carry further:

- **It is a boolean.** ADR-0003 defines editions as *sets of enabled
  modules*; a single `isPro` flag cannot express "chat module on, AI module
  off", and every new module would need its own ad-hoc flag.
- **It is a shared secret.** Anyone who learns the code has everything,
  forever, and there is no way to revoke or differentiate.
- **It cannot connect to anything.** A future licence purchase
  ([`IDEA-0188`](../ideas/IDEA-0188-payment-rails-licensing.md)) has nothing
  to hand the user that the app could check.

## Proposal

A local **entitlement store** that replaces the boolean pair:

- An entitlement is a signed token (format to decide — signed JSON is enough)
  naming a set of enabled modules/capabilities, verified **offline** against a
  public key embedded in the build. No network call, ever — the same
  fail-closed-for-the-module, never-for-the-core rule as
  [`FEAT-0032`](FEAT-0032-plugin-contract.md).
- The footer switch stays, for every edition: it toggles between the
  presentation modes the current entitlement allows (today: calculator-only
  vs. full panel). Without an entitlement it is simply disabled, as now.
- Settings import in the UI: paste or load a licence file; removal returns
  the app to Community behaviour without a reload error.
- The entitlement token is Class A: stored locally, never sent anywhere.
- Modules read the entitlement through one accessor, not by touching
  `settingsState` fields — the seam [`FEAT-0014`](FEAT-0014-edition-build-targets.md)'s
  module boundary needs anyway.

The cheat code does not have to die on day one: it can become a dev-only
override (env-gated, absent from production bundles) so development and
initiated-user workflows keep working during the transition.

## Acceptance criteria

- [ ] An entitlement names a set of modules; no code path reads a bare
      `isPro`-style boolean for gating any more
- [ ] Verification runs fully offline, proven by a test with network mocked out
- [ ] A tampered token verifies as invalid, proven by a test
- [ ] Removing the entitlement returns the app to Community behaviour with no
      reload error and no orphaned UI
- [ ] The production bundle contains no cheat-code hash, asserted against the
      bundle
- [ ] The footer switch works identically for an entitled user and is disabled
      otherwise
- [ ] The token never leaves the device (Class A; no telemetry, no validation
      call)

## Out of scope

- Payment and issuance — [`IDEA-0188`](../ideas/IDEA-0188-payment-rails-licensing.md).
- The plugin sandbox and revocation of *plugins* —
  [`FEAT-0032`](FEAT-0032-plugin-contract.md) / ADR-0005.
- The build-time module split itself —
  [`FEAT-0014`](FEAT-0014-edition-build-targets.md).

## Open questions

- **Token format.** Signed JSON vs. JWT vs. a wallet-signature-derived proof
  (the NFT thought in [`IDEA-0188`](../ideas/IDEA-0188-payment-rails-licensing.md)).
  The store's interface should not care; decide the first format cheaply.
- **Migration.** What happens to users whose `isProLicenseActive` is already
  true — grandfather them with a generated local token, or ask them to re-enter
  the dev override?
- See `docs/TODO.md` item 26 for the decision framing.

## Links

- `src/components/shared/PowerToggle.svelte`, `src/stores/settings.svelte.ts`
- [`docs/adr/0003-edition-boundary.md`](../../adr/0003-edition-boundary.md)
- `docs/TODO.md` item 26
