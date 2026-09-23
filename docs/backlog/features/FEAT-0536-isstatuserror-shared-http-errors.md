---
id: FEAT-0536
title: Extract shared isStatusError helper for API routes
type: feature
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: []
parent: FEAT-0341
size: S
estimate: 2
---

# FEAT-0536 — Extract shared isStatusError helper for API routes

## Problem

`isStatusError()` plus its `StatusError` interface is copy-pasted identically in
four API routes: `src/routes/api/{funding-rate,position-tiers,tickers,trading-pairs}/+server.ts`
(`:29`, tickers `:30`). A fifth route needing the same guard would become copy
number five, and a fix to the guard would need four identical edits.

## Proposal

Create `src/utils/server/httpErrors.ts` exporting `isStatusError` and the
`StatusError` type; replace all four copies with imports. No behavior change —
error responses stay identical.

## Acceptance criteria

- [ ] Shared module exists, all four routes import from it, no local copy remains
- [ ] Route test suites pass (`tickers` plus the other three route suites)
- [ ] Error responses (status codes, bodies) verified unchanged by existing tests

## Out of scope

- Changing error-handling semantics; the FEAT-0320 `safeJsonParse` follow-up is separate
- Touching any other route

## Open questions

None blocking. Module path follows the `src/utils/server/` convention if it
exists, otherwise the builder picks the nearest equivalent and notes it.

## Links

- `src/routes/api/funding-rate/+server.ts`, `position-tiers`, `tickers`, `trading-pairs`
- Context (done, no dependency): `FEAT-0320`
- Parent epic: `FEAT-0341`
