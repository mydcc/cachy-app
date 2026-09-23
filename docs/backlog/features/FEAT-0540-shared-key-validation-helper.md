---
id: FEAT-0540
title: Extract a shared key-validation helper for exchange signing
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: security
data_class: none
adr: none
depends_on: []
size: S
estimate: 2
---

# FEAT-0540 — Extract a shared key-validation helper for exchange signing

## Problem

`validateBitunixKeysAsync` (`src/utils/crypto/exchangeSigning.ts:118`) and
`validateBitgetKeysAsync` (`:147`) share the same skeleton and differ only in
the signing call and arity (passphrase). A fix to the validation flow must be
applied twice, in credential-adjacent code where divergence is dangerous.

## Proposal

A `validateKeysWithSigningTest()` helper taking the venue-specific signing-test
callback (plus passphrase handling); both validators become thin wrappers.
Rejection behavior for invalid keys must be identical, covered by tests.

## Acceptance criteria

- [ ] Shared helper exists; both validators delegate to it, no duplicated flow remains
- [ ] Existing signing/validation tests pass; invalid-key rejection paths covered unchanged
- [ ] Human review confirms no credential-handling drift (security-adjacent code, no solo merge)

## Out of scope

- Changing signing algorithms, validation rules, or where credentials are stored
- Touching the order/signing hot path beyond these two validators

## Open questions

None blocking.

## Links

- `src/utils/crypto/exchangeSigning.ts:118`, `:147`
