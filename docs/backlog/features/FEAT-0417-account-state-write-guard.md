---
id: FEAT-0417
title: Guard position-mode writes in CI so the freshness stamp cannot be dropped
type: feature
status: done
priority: P2
milestone: none
shipped: 1.6.0-beta.261
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: []
---

# FEAT-0417 — Guard position-mode writes in CI so the freshness stamp cannot be dropped

## Problem

`accountState.positionMode` and `accountState.positionModeAt` only mean
something as a pair: the value, and the moment it was true. BUG-0409 made the
mode chip depend on that pair — it blanks whichever half is far older than the
other rather than pairing two moments that never coexisted.

`setPositionMode()` writes both in one step. Nothing requires its use. A direct
assignment sets the value, leaves the stamp behind, and no test fails; the chip
just ages dishonestly. This already happened once — `paperTradingService` wrote
directly until #2752 replaced it — and there is no reason it would not happen
again.

The same shape produced BUG-0409, BUG-0410 and BUG-0412: an invariant spread
across two fields, held together by convention. Three fixes, no mechanism.

## Proposal

A CI check in the shape the repo already uses for `scripts/audit-decimal.mjs`
and its "Decimal.js Enforcement" job: scan `src/` for a direct assignment to a
guarded field, fail the build, and offer `// audit: safe — <reason>` for a line
that genuinely needs one.

The script carries its own `--selftest`, run as a separate CI step before the
scan. A guard that silently stops matching is the exact failure it exists to
prevent — a green tick that means nothing. This is a deliberate departure from
`audit-decimal.mjs`, which has no such check.

**Deliberate limit, stated rather than implied:** this is a text scan. It
catches `accountState.positionMode = x`, the form every instance so far has
taken. It does not catch an alias — `const s = accountState; s.positionMode = x`.
Closing that needs the type system, which is the follow-up work; this guard is
what holds until then, and it is worth having on its own because it lands in
an afternoon rather than a week.

## Acceptance criteria

- [x] `scripts/audit-account-state.mjs` fails on a direct assignment and passes on a clean tree
- [x] `--selftest` covers assignment forms and comparison forms, and fails if the pattern stops matching
- [x] Both run as CI steps in the existing audit workflow
- [x] The scan covers `.svelte` files, not only `.ts` — the first offender was a component
- [x] The script states its own limit in its header, so the next reader does not mistake it for a proof

## Links

- [BUG-0409](../bugs/BUG-0409-mode-chip-stale-after-change.md) — introduced the freshness stamps
- [BUG-0412](../bugs/BUG-0412-duplicate-sidebar-account-fetch-race.md) — same class, ordering half
- [FEAT-0416](FEAT-0416-account-read-protocol-adr.md) — the ADR that records what neither types nor this guard can express
