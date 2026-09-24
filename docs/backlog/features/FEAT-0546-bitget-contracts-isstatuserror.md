---
id: FEAT-0546
title: Migrate bitget/contracts route to shared isStatusError
type: feature
status: done
shipped: unreleased
priority: P3
milestone: none
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: []
parent: FEAT-0341
size: XS
estimate: 1
---

# FEAT-0546 — Migrate bitget/contracts route to shared isStatusError

## Problem

`src/routes/api/bitget/contracts/+server.ts:24-29` carries its own local copy
of the `isStatusError()` guard plus the `StatusError` interface — the fifth
copy after FEAT-0536 unified the other four routes into
`src/utils/server/httpErrors.ts`. A fix to the guard would again need two
places instead of one.

## Proposal

Replace the local copy in `bitget/contracts/+server.ts` with an import of
`isStatusError` from `../../../utils/server/httpErrors`. No behavior change —
error responses stay identical.

## Acceptance criteria

- [ ] No local `isStatusError`/`StatusError` copy remains in `bitget/contracts/+server.ts`; the route imports from the shared module
- [ ] Existing `bitget/contracts` route test suite passes (or: no suite exists, noted in the PR)
- [ ] Error responses (status codes, bodies) verified unchanged by existing tests

## Out of scope

- Changing error-handling semantics
- Touching any other route

## Open questions

None blocking.

## Links

- `src/routes/api/bitget/contracts/+server.ts`
- Shared module (done, no dependency): `src/utils/server/httpErrors.ts`
- Context: `FEAT-0536` (unified the other four routes)
- Parent epic: `FEAT-0341`
