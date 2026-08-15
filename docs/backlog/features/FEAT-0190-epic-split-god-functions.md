---
id: FEAT-0190
title: "Epic: Decompose the five oversized modules along the module boundary"
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

# FEAT-0190 — Epic: Decompose the five oversized modules along the module boundary

> **Tracking epic.** The work itself lives in five per-file sub-items,
> [`FEAT-0193`](FEAT-0193-split-market-watcher.md) …
> [`FEAT-0197`](FEAT-0197-split-settings-store.md). This item exists to hold the
> shared rules and the sequencing; it is never dispatched or implemented
> directly. It closes when all five sub-items are `done`.

## Problem

Five modules have grown large enough that every future milestone has to work
around them: M1's execution gate wires into the services, M2's adapter
interface dismantles `bitunixWs.ts` piecemeal anyway, and
[`FEAT-0187`](FEAT-0187-edition-entitlement-switch.md) needs the
edition/entitlement state out of the settings monolith. Decomposing them late
means decomposing them while they are load-bearing for more callers.

### Corrected measurements, August 2026

The original version of this item was written from an external review (Jules,
August 2026) that reported "five functions" of 600–1500 lines, with line
numbers that no longer resolve to anything. **That framing was wrong and the
sizing followed it.** Measured against `develop` at `07f7a34`:

These are five **classes**, not functions. Only **two methods** anywhere in
them exceed 200 lines:

| Module | File lines | Largest method | Over 200? | Test files |
| --- | --- | --- | --- | --- |
| `src/services/bitunixWs.ts` | 1897 | `handleMessage` — **577** | ✗ | 6 |
| `src/stores/settings.svelte.ts` | 1807 | `load` — **382** | ✗ | 1 |
| `src/stores/market.svelte.ts` | 1000 | `applyUpdate` — 127 | ✓ already met | 3 |
| `src/services/marketWatcher.ts` | 822 | `ensureHistory` — 125 | ✓ already met | 5 |
| `src/services/activeTechnicalsManager.svelte.ts` | 730 | `performCalculation` — 112 | ✓ already met | **0** |

Two consequences:

1. The "no function over 200 lines" criterion is **already satisfied in three
   of the five modules**. For those three the remaining value is class-level
   decomposition along the ADR-0003 boundary — worth doing, but it is a
   different and smaller job than the original sizing implied.
2. **Test coverage is distributed the wrong way round.** The two modules that
   carry the actual oversized methods are also the two extremes of coverage:
   `bitunixWs.ts` is the best-covered file of the five, and
   `settings.svelte.ts` has a single security-focused test.
   `activeTechnicalsManager.svelte.ts` has none at all, which makes
   "behaviour-preserving" unverifiable there until tests exist.

## Proposal

Behaviour-preserving decomposition, **one module per pull request**, tracked
as five sub-items. Sequenced by risk and coverage rather than by size:

| Order | Item | Module | Route |
| --- | --- | --- | --- |
| 1 | [`FEAT-0193`](FEAT-0193-split-market-watcher.md) | `marketWatcher.ts` | agent-dispatchable |
| 2 | [`FEAT-0194`](FEAT-0194-split-bitunix-ws-handle-message.md) | `bitunixWs.ts` | agent-dispatchable, `depends_on: [..., FEAT-0193]` |
| 3 | [`FEAT-0195`](FEAT-0195-split-market-store.md) | `market.svelte.ts` | agent-dispatchable, `depends_on: [..., FEAT-0198]` |
| 4 | [`FEAT-0196`](FEAT-0196-split-active-technicals-manager.md) | `activeTechnicalsManager.svelte.ts` | **manual** — no tests exist |
| 5 | [`FEAT-0197`](FEAT-0197-split-settings-store.md) | `settings.svelte.ts` | **manual** — credentials + Klasse-A data |

**FEAT-0193 and FEAT-0194 run one at a time, enforced rather than merely
suggested.** FEAT-0194's `depends_on` lists `FEAT-0193`, and
`scripts/jules/dispatch-backlog.mjs` will not dispatch an item while any of
its `depends_on` entries are not `status: done`. So FEAT-0194 stays
undispatched until FEAT-0193's PR is reviewed, merged, and its item flipped to
`done` on `develop` — not merely opened. Two independent agent sessions
touching adjacent service-layer files at the same time is the same
parallel-refactor collision the whole epic waited for the decimal migration
to avoid; this keeps it from recurring one level down.

### Rules that apply to every sub-item

- **Tests first where coverage is thin.** Characterisation tests around
  current behaviour before moving a line. Where a module has no tests, writing
  them is part of that sub-item and comes first in its own PR.
- **Split along the ADR-0003 boundary, not just by size.** Each extracted unit
  is either clearly core or clearly module-side.
- **`refactor:` commits only**; no behaviour change rides along.
- **No public API change**, or it is listed and justified on completion.

### Why two sub-items stay manual

`scripts/jules/dispatch-backlog.mjs` excludes `area: execution`, `security`,
`exchange` and `P0` from unattended dispatch. Two of these modules fall inside
the *reasoning* behind that exclusion even though the epic is filed as
`area: core`:

- `settings.svelte.ts` — `load()` deep-merges persisted user settings, runs
  localStorage-keyed migrations, and drives **async decryption of the stored
  exchange API keys and secrets** (`encryptedApiKeys`, `encryptedSecrets`,
  `secretsReady`). That is Klasse-A data plus credentials. The failure mode is
  precisely the one found and fixed in `trade.svelte.ts:load()` during
  BUG-0182's review: a parse path that silently falls back to defaults and
  discards user data, with CI green throughout.
- `activeTechnicalsManager.svelte.ts` — zero tests, so the epic's own
  "behaviour-preserving" requirement cannot be demonstrated. Dispatching a
  refactor whose central claim is unverifiable is not a scope call, it is a
  coin flip.

## Acceptance criteria

- [ ] All five sub-items ([`FEAT-0193`](FEAT-0193-split-market-watcher.md) …
      [`FEAT-0197`](FEAT-0197-split-settings-store.md)) are `done` or `dropped`
- [ ] No method in the five modules exceeds 200 lines
- [ ] Edition/entitlement state lives in its own store, imported by
      `settings.svelte.ts` consumers through one accessor
- [ ] `bitunixWs.ts`'s extracted units map onto the FEAT-0016 adapter concerns
      (transport, parsing, dispatch), stated in that sub-item's PR description
- [ ] No public API of the five modules changes, or each change is listed and
      justified in the relevant sub-item on completion

## Out of scope

- The adapter interface itself ([`FEAT-0016`](FEAT-0016-exchange-adapter-interface.md)).
- The entitlement mechanism ([`FEAT-0187`](FEAT-0187-edition-entitlement-switch.md)).
- Any behaviour or performance change beyond decomposition.

## Links

- Sub-items: [`FEAT-0193`](FEAT-0193-split-market-watcher.md),
  [`FEAT-0194`](FEAT-0194-split-bitunix-ws-handle-message.md),
  [`FEAT-0195`](FEAT-0195-split-market-store.md),
  [`FEAT-0196`](FEAT-0196-split-active-technicals-manager.md),
  [`FEAT-0197`](FEAT-0197-split-settings-store.md)
- [`FEAT-0198`](FEAT-0198-market-store-buffer-pool-characterisation-tests.md) —
  prerequisite test-only item, unblocks FEAT-0195
- [`docs/adr/0003-edition-boundary.md`](../../adr/0003-edition-boundary.md)
- [`BUG-0182`](../bugs/BUG-0182-epic-decimal-migration-rust.md),
  [`BUG-0183`](../bugs/BUG-0183-epic-decimal-migration-core.md),
  [`BUG-0184`](../bugs/BUG-0184-epic-decimal-migration-ui.md) — the arithmetic
  rewrite these splits deliberately waited for
