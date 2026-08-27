---
id: FEAT-0321
title: Sign every Bitunix request through one signer instead of three copies
type: feature
status: in-progress
assignee: claude
branch: feat/bitunix-single-signer
priority: P3
milestone: M2
editions: [community, pro, private]
area: exchange
data_class: none
adr: ADR-0007
depends_on: [FEAT-0228]
estimate: 2
size: S
start_date: 2026-08-27
---


# FEAT-0321 — Sign every Bitunix request through one signer instead of three copies

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

## What the merge actually found

There were five copies, not three. Beyond the three this item named, the same
algorithm was hand-rolled inline a fourth and fifth time in
`src/routes/api/sync/positions-pending/+server.ts` and
`src/routes/api/sync/order-detail/+server.ts` — routes
[`FEAT-0228`](FEAT-0228-venue-modules-in-proxy-routes.md) never touched, which
is why the count taken from that item's file was short. Both were folded in
under the same criterion ("only one implementation remains"); leaving them
would have preserved exactly the drift risk this item exists to remove.

All five agreed on every signature byte. The single divergence is cosmetic and
outside the digest: the four inline copies built the URL's query string with
`new URLSearchParams(params)` (insertion order) while
`generateBitunixSignature` sorts the entries first. It could never have changed
a signature — the digest is built from a separately sorted `key + value`
concatenation — and never showed on the wire either, since every inline site
passed at most one query parameter. Sorted is the surviving behaviour, and
`src/utils/server/bitunix.test.ts` records the difference explicitly.

One further stale copy sits in `src/routes/api/positions/+server.ts.bak`, a
tracked backup file that nothing imports and no build compiles. Left alone
here under the repo's defensive-deletion rule; it wants its own item.

`src/utils/crypto/exchangeSigning.ts` is deliberately *not* folded in. It is
the client-side WebCrypto signer from FEAT-0285 — a different runtime, async
where this one is synchronous — and `exchangeSigning.test.ts` already holds the
two in byte parity.

## Acceptance criteria

- [x] A test proves the three signers agree (or records precisely how they
      differ) for the same nonce, timestamp, key, params and body —
      `src/utils/server/bitunix.test.ts`, which keeps the deleted copies as
      executable characterisations rather than losing the proof with the code
- [x] Only one Bitunix signing implementation remains
- [x] The balance and positions paths still pass their existing tests
      untouched

## Note on the CodeQL alert

All three sites carry a `// codeql[js/insufficient-password-hash]` suppression
and a comment explaining why the query is wrong here: nothing is stored, and
the algorithm is Bitunix's own (`docs/bitunix-api/01_sign.md`), so a
password-hashing KDF would fail authentication rather than harden anything.
Consolidating the three must carry that annotation onto the survivor — losing
it would reopen the alert on the one signer left.

The comment also records what *is* true about the construction: `H(digest ||
secret)` is a secret-suffix MAC rather than HMAC. Not exploitable against
SHA-256 today, and not ours to change, but worth stating where the next reader
of this code will look.

## Out of scope

Bitget signing, which already has exactly one implementation
(`generateBitgetSignature`) and correctly uses HMAC.

## Links

- [`FEAT-0228`](FEAT-0228-venue-modules-in-proxy-routes.md) — gathered the
  copies into one file and recorded why it stopped short of merging them
- [`ADR-0007`](../../adr/0007-exchange-adapter-boundary.md)
- `src/utils/server/bitunix.ts`, `src/utils/server/venues/bitunix.ts`
