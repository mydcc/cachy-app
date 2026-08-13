---
id: FEAT-0190
title: "Epic: Split the five oversized functions along the module boundary"
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: core
data_class: none
adr: none
depends_on: [BUG-0182, BUG-0183, BUG-0184]
estimate: 8
size: XL
target_date: 2026-09-28
---

# FEAT-0190 — Epic: Split the five oversized functions along the module boundary

## Problem

An external review (Jules, August 2026) flagged five functions whose size
makes them hard to follow and risky to modify. Confirmed locations:

| Location | Reported size |
| --- | --- |
| `src/services/activeTechnicalsManager.svelte.ts:43` | > 600 lines |
| `src/stores/market.svelte.ts:74` | > 700 lines |
| `src/services/bitunixWs.ts:73` | > 1500 lines |
| `src/services/marketWatcher.ts:40` | > 700 lines |
| `src/stores/settings.svelte.ts:503` | > 1000 lines |

Every future milestone touches these files: M1's execution gate wires into the
services, M2's adapter interface dismantles `bitunixWs.ts` piecemeal anyway,
and [`FEAT-0187`](FEAT-0187-edition-entitlement-switch.md) needs the
edition/entitlement state out of the settings monolith. Splitting them late
means splitting them while they are load-bearing for more callers.

## Proposal

Behaviour-preserving decomposition, one file per pull request, in this order
(least to most entangled): `marketWatcher.ts`, `activeTechnicalsManager.svelte.ts`,
`market.svelte.ts`, `settings.svelte.ts`, `bitunixWs.ts`.

Rules for every split:

- **Tests first where coverage is thin.** Characterisation tests around the
  current behaviour before moving a line; the existing `*.test.ts` files next
  to each module define the baseline.
- **Split along the ADR-0003 boundary, not just by size.** Each extracted unit
  is either clearly core or clearly module-side. Concretely:
  `settings.svelte.ts` separates edition/entitlement state (`isPro`,
  `isProLicenseActive` — the future [`FEAT-0187`](FEAT-0187-edition-entitlement-switch.md)
  store) from user preferences; market/technicals extraction keeps indicator
  UI importable without any server-backed module.
- **`bitunixWs.ts` is split toward M2's adapter shape**
  ([`FEAT-0016`](FEAT-0016-exchange-adapter-interface.md)): message parsing,
  channel management and store dispatch become the units the adapter
  interface will later formalise — so this refactor is a down payment on M2,
  not throwaway motion.
- `refactor:` commits only; no behaviour change rides along.

**Sequencing is deliberate:** `depends_on` the three decimal-migration epics
([`BUG-0182`](../bugs/BUG-0182-epic-decimal-migration-rust.md),
[`BUG-0183`](../bugs/BUG-0183-epic-decimal-migration-core.md),
[`BUG-0184`](../bugs/BUG-0184-epic-decimal-migration-ui.md)) because they
rewrite arithmetic in these same files — refactoring in parallel guarantees
conflicts, and the migration is the correctness work, so it goes first.

## Acceptance criteria

- [ ] No function in the five files exceeds 200 lines
- [ ] Each split lands as its own `refactor:` PR with `npm run check` and the
      full affected test suite green
- [ ] Edition/entitlement state lives in its own store, imported by
      `settings.svelte.ts` consumers through one accessor
- [ ] `bitunixWs.ts`'s extracted units map onto the FEAT-0016 adapter concerns
      (transport, parsing, dispatch), stated in the PR description
- [ ] No public API of the five modules changes (callers untouched), or the
      change is listed and justified in the item on completion

## Out of scope

- The adapter interface itself ([`FEAT-0016`](FEAT-0016-exchange-adapter-interface.md)).
- The entitlement mechanism ([`FEAT-0187`](FEAT-0187-edition-entitlement-switch.md)).
- Any behaviour or performance change beyond decomposition.

## Open questions

- Whether `settings.svelte.ts` and `market.svelte.ts` splits should wait for
  per-file sub-items (this epic may be broken into five FEATs if dispatching
  to agents one file at a time works better — same IDs pattern as the decimal
  epics).

## Links

- [`BUG-0182`](../bugs/BUG-0182-epic-decimal-migration-rust.md),
  [`BUG-0183`](../bugs/BUG-0183-epic-decimal-migration-core.md),
  [`BUG-0184`](../bugs/BUG-0184-epic-decimal-migration-ui.md)
- [`docs/adr/0003-edition-boundary.md`](../../adr/0003-edition-boundary.md)
