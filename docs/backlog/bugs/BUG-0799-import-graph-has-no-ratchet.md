---
id: BUG-0799
title: Nothing stops the import graph from tangling further than it already is
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: repo
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: chore/arch-cycle-ratchet
---

# BUG-0799 — The import graph has no ratchet (W1-02 / B4)

## Symptom

The target layering `components -> stores -> services -> lib -> utils` is
written down and gated at the file level: ESLint refuses a *new* file that
imports across a boundary and grandfathers 37 that already do. Nothing
measures the shape those grandfathers add up to, so the gate cannot tell
whether the graph got better or worse — only whether an unlisted file
appeared.

## Evidence

Derived from the 2026-11-03 structure audit (W1-02, B4) and re-measured
against `develop` at `247d1632f`. The audit reported one SCC of 237 files. That
figure is reproducible, but only under a wide definition of "import", and the
distinction matters enough to record here:

| Edges counted | Cycles | Largest |
| --- | --- | --- |
| static value imports | 4 | 8 modules |
| + `import()` | 1 | 199 modules |
| + `import()` + `import type` | 1 | **237 modules** |

- 738 modules, 2 464 static value edges, 46 lazy `import()` edges.
- Load-order cycles: `src/lib/appAuth.ts` (8), `src/services/bitunixWs.ts` (8),
  `src/services/activeTechnicals/calculationExecutor.ts` (5),
  `src/lib/windows/implementations/SymbolPickerView.svelte` (4).
- One 199-module dependency cycle once lazy edges count, anchored at
  `src/components/alerts/bots/BotIntentEditor.svelte`.
- Uphill edges: `services->stores` 113, `lib->stores` 41, `lib->services` 15,
  `utils->services` 7, `lib->components` 6, `utils->lib` 2.

The 38-module difference between the second and third row is `import type`,
which is erased at compile time and which the ESLint boundary rules explicitly
allow. The 191-module difference between the first and second is `import()`:
registries that pull their entries on demand (`AlertPanelView.svelte` maps tab
ids to `() => import(…)`). Neither is a load-order hazard. Both are real
coupling.

## Cause

An architectural constraint with no measurement becomes a comment. `eslint.config.js`
sees one file at a time; the property that actually degrades — "module A and
module B can reach each other" — is a graph property, and nothing computes it.

## Fix

`scripts/arch-cycles.mjs` builds the graph and `scripts/arch-cycles.baseline.json`
freezes the current state; `src/tests/architecture/cycle_ratchet.test.ts` runs
the comparison in the `unit` project, so `npm test` and CI both enforce it.

Three axes, because SCC size alone is a lagging indicator — a new
`services -> stores` import inside the 199-module blob changes its size by
exactly zero:

1. **`static.sccs`** — load-order cycles. These are the ones that break.
2. **`static.layerPairs`** — edges per layer pair. The leading indicator, and
   the reason a brand-new uphill pair fails on a single edge.
3. **`combined.sccs` + `lazy.layerPairs`** — the 199-module blob and the lazy
   couplings inside it. Not a crash risk, but the reason the layers cannot be
   separated today.

`--update-baseline` refuses to raise any value.

## Acceptance criteria

- [x] The analyser reports all three measurements and excludes `import type`,
      comment text, test files and declaration files
- [x] The baseline records the current state and only goes down
- [x] The gate fails on a new cycle, on a grown cycle and on a new uphill pair
      — each verified against the real tree by adding the offending import and
      removing it again
- [x] `--update-baseline` exits non-zero and writes nothing when a regression
      is present
- [x] Self-tests pin the analyser's decisions (comment, `import type`,
      `import()`), so a matcher that silently stopped matching fails

## Out of scope

- **Burn-down.** Removing the 37 `servicesToStoresAllowlist` entries and the
  `lib -> stores` edges is the actual work and gets its own PRs, each lowering
  the baseline it touches. This item only makes the direction measurable.
- **The four existing load-order cycles.** They are small and frozen; fixing
  them is a separate refactor.
- **`docs/architecture/cachy-architecture.dataflow.json`.** Unchanged: no
  service was added or removed and no data flow moved. The diagram's own rules
  forbid edits for infrastructure-only changes.

## Links

- `scripts/arch-cycles.mjs` (the reasoning lives in its header)
- `scripts/arch-cycles.baseline.json`
- `src/tests/architecture/cycle_ratchet.test.ts`
- `eslint.architecture.boundaries.js`
- `docs/ARCHITECTURE.md` — "Rules with teeth"
- `docs/backlog/bugs/BUG-0790-unreachable-modules-still-maintained.md` — the
  preceding cleanup that made the graph measurable at all
