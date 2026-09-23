---
id: FEAT-0535
title: Extract shared flattenKeys helper for i18n scripts
type: feature
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: tooling
data_class: none
adr: none
depends_on: []
parent: FEAT-0341
size: XS
estimate: 1
---

# FEAT-0535 — Extract shared flattenKeys helper for i18n scripts

## Problem

`flattenKeys()` exists twice, byte-identical: `scripts/generate-i18n-types.js:37`
and `scripts/validate-i18n.js:37`. Two copies of key-flattening logic drift
apart silently the next time someone fixes a bug in only one of them.

## Proposal

Extract the function to `scripts/lib/i18nKeys.mjs` and import it from both
scripts. No behavior change; both scripts must produce byte-identical output
before and after (diff the generated `schema.d.ts` and the validator output).

## Acceptance criteria

- [ ] `scripts/lib/i18nKeys.mjs` exports `flattenKeys`, both scripts import it, no local copy remains
- [ ] `node scripts/generate-i18n-types.js` output is byte-identical before/after
- [ ] `node scripts/validate-i18n.js` passes before/after

## Out of scope

- Changing what either script does; refactoring `storageWrapper` or any runtime code
- Touching `src/` at all

## Open questions

None blocking. If `scripts/lib/` should live elsewhere per repo convention, the builder picks the path and notes it in the PR.

## Links

- `scripts/generate-i18n-types.js`, `scripts/validate-i18n.js`
- Parent epic: `FEAT-0341`
