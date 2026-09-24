---
id: FEAT-0538
title: Unify the duplicated SMC mitigation checks
type: feature
status: done
shipped: unreleased
priority: P2
milestone: none
editions: [community, pro, private]
area: indicators
data_class: none
adr: none
depends_on: []
size: M
estimate: 5
---

# FEAT-0538 — Unify the duplicated SMC mitigation checks

## Problem

`src/services/smc/smcService.ts` carries two ~50-line sweep-line mitigation
implementations, `checkMitigation` (`:329`, fair value gaps) and
`checkMitigationOB` (`:379`, order blocks), differing only in zone type,
activation offset (`+3` vs `+1`) and overlap predicate. A fix to the sweep
logic must be applied twice, and the two copies can diverge unnoticed.

## Proposal

A generic `checkZoneMitigation()` with a strategy parameter (zone-type
accessors, activation offset, overlap predicate); both call sites become thin
wrappers. Mitigation decisions must be identical before/after, proven by a
characterization test over long/short zones.

## Acceptance criteria

- [ ] One generic mitigation implementation; both call sites delegate to it
- [ ] `smcService.test.ts` passes, plus a characterization test proving identical mitigation decisions before/after
- [ ] Human review confirms no trading-logic drift (indicator-adjacent code, no solo merge)

## Out of scope

- The FEAT-0345 decimal.js migration — this item goes first so the migration has fewer call sites; not parallel
- New zone types or changed mitigation semantics

## Open questions

None blocking. The exact shape of the strategy parameter is the builder's
choice, documented in the PR.

## Links

- `src/services/smc/smcService.ts:329`, `:379`; `src/services/smc/types.ts`
- Sequencing (not a dependency): `FEAT-0345` should follow this item
