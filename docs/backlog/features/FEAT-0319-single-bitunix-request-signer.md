---
id: FEAT-0319
title: Sign every Bitunix request through one signer instead of three copies
type: feature
status: specced
priority: P3
milestone: M2
editions: [community, pro, private]
area: exchange
data_class: none
adr: ADR-0007
depends_on: [FEAT-0228]
estimate: 2
size: S
---


# FEAT-0319 — Sign every Bitunix request through one signer instead of three copies

## Problem

Bitunix's signing algorithm — `digest = sha256(nonce + timestamp + apiKey +
sortedParams + body)`, then `signature = sha256(digest + apiSecret)` — exists
in the codebase three times:

- `src/utils/server/bitunix.ts`, as `generateBitunixSignature`;
- inline in the balance path, hand-rolled with `createHash`/`randomBytes`;
- inline in the positions path, hand-rolled again.

[`FEAT-0228`](FEAT-0228-venue-modules-in-proxy-routes.md) gathered all three
into `src/utils/server/venues/bitunix.ts` but deliberately did not merge them:
that item's contract was "the request/response contract is unchanged", and
merging signers changes what bytes go on the wire if the copies have drifted.
They now sit within a hundred lines of each other, which makes the duplication
obvious and the drift risk concrete rather than theoretical.

Three copies of a signing routine is three places a Bitunix API change has to
land, and two of them have no test of their own. A signature that is wrong in
only one of the three fails as an authentication error against a live account.

## Proposal

Establish first whether the three produce identical signatures for identical
input — a test that drives all three with fixed nonce/timestamp answers that,
and is worth having regardless of what it finds. If they agree, delete the two
inline copies in favour of `generateBitunixSignature`. If they disagree, the
difference is a bug and gets its own item before anything is deleted.

## Acceptance criteria

- [ ] A test proves the three signers agree (or records precisely how they
      differ) for the same nonce, timestamp, key, params and body
- [ ] Only one Bitunix signing implementation remains
- [ ] The balance and positions paths still pass their existing tests
      untouched

## Out of scope

Bitget signing, which already has exactly one implementation
(`generateBitgetSignature`).

## Links

- [`FEAT-0228`](FEAT-0228-venue-modules-in-proxy-routes.md) — gathered the
  copies into one file and recorded why it stopped short of merging them
- [`ADR-0007`](../../adr/0007-exchange-adapter-boundary.md)
- `src/utils/server/bitunix.ts`, `src/utils/server/venues/bitunix.ts`
