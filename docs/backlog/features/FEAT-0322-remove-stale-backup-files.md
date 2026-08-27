---
id: FEAT-0322
title: Remove stale backup files from the repository
type: feature
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: []
version: 1.6.0-beta.163
---

# FEAT-0322 — Remove stale backup files from the repository

## Problem

The repository has tracked `.bak` files that are no longer needed and create noise in the codebase. Specifically, `src/routes/api/positions/+server.ts.bak` contains a hand-rolled copy of the Bitunix request-signing algorithm that was superseded by FEAT-0321, which consolidated every live Bitunix signer into a single `generateBitunixSignature` in `src/utils/server/bitunix.ts`.

The `.bak` file:
- Is tracked in git but nothing imports it
- Is not built or used by any build process
- Represents stale implementation that doubles maintenance surface area
- Has been deliberately preserved under CLAUDE.md's "defensive deletion" rule, but that protection no longer applies

## Proposal

Remove all tracked `.bak` files from the repository. As of scan at session start, only one exists:
- `src/routes/api/positions/+server.ts.bak`

Verify that no build artifacts, tests, or functionality are affected.

## Acceptance criteria

- [x] All `.bak` files identified and listed
- [x] Files deleted from working tree
- [x] `npm run check` passes (svelte-check)
- [x] `npx vitest run src/routes/api/positions` passes
- [x] No other tests regress

## Out of scope

- Removal of other commented-out or disabled code
- Removal of snapshot test fixtures (`.snap` files)
- Changes to `.gitignore` to prevent future `.bak` files (that is a separate tooling item if desired)

## Open questions

None — the work is clear and low-risk.

## Links

- FEAT-0321: `refactor(exchange): consolidate Bitunix signer` — consolidated all Bitunix signing into one place
- `src/routes/api/positions/+server.ts.bak` — the file to remove
- CLAUDE.md: defensive deletion rule (no longer applies after consolidation)
