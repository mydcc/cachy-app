---
id: BUG-0799
title: Nothing stops the import graph from tangling further than it already is
type: bug
status: done
shipped: v1.6.0-beta.526 (PR #4532)
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
imports across a boundary and grandfathers 37 that already do. Nothing measures
the shape those grandfathers add up to, so the gate cannot tell whether the
graph got better or worse — only whether an unlisted file appeared.

## Evidence

Derived from the 2026-11-03 structure audit (W1-02, B4), then re-measured
against `develop` at `247d1632f` with the analyser this item adds. The gate
scans 717 modules, 2 448 static value edges and 42 runtime `import()` edges
(test fixtures excluded).

**The audit's "237 files" is reproducible, and it is not a load-order hazard.**
It only appears when type-only constructs and lazy calls are counted as edges:

| Edges counted | Cycles | Largest |
| --- | --- | --- |
| static value imports | 4 | **8 modules** |
| + runtime `import()` | 1 | **197 modules** |
| + `import type` and `import("./x").Member` | 2 | 237 modules (+ a 3-module) |

The last row is the audit's figure, reproduced exactly — including its layer
breakdown `services=83 components=64 stores=44 lib=43 utils=2 actions=1`. It
requires counting 566 type-only imports and 21 `ImportTypeNode` references,
every one of which the compiler erases. So 229 of those 237 modules are
connected only by code that no bundler emits.

What the gate measures:

- Load-order cycles: `src/lib/appAuth.ts` (8), `src/services/bitunixWs.ts` (8),
  `src/lib/windows/implementations/SymbolPickerView.svelte` (4),
  `src/services/activeTechnicals/calculationExecutor.ts` (4).
- One 197-module dependency cycle once runtime `import()` counts, anchored at
  `src/components/alerts/bots/BotIntentEditor.svelte`.
- Uphill static edges: `services->stores` 113, `lib->stores` 41,
  `lib->services` 15, `utils->services` 7, `lib->components` 6, `utils->lib` 2.
  Uphill lazy edges: `stores->components` 2, `lib->services` 1,
  `utils->stores` 1.

## Cause

An architectural constraint with no measurement becomes a comment.
`eslint.config.js` sees one file at a time; the property that actually degrades
— "module A and module B can still reach each other" — is a graph property, and
nothing computed it.

## Fix

`scripts/arch-cycles.mjs` builds the graph and `scripts/arch-cycles.baseline.json`
freezes the state; `src/tests/architecture/cycle_ratchet.test.ts` compares the
two inside the `unit` project, so `npm test` and CI both enforce it.

Three decisions worth keeping:

1. **TypeScript's parser decides what is an edge**, not a regex. Four shapes in
   this tree break a lexical scan: `import type` as the first statement of a
   `<script>` block, inline `import { type X }`, `import("./x").Member` inside a
   type annotation, and imports quoted in comments. Two of those produced a
   phantom cycle during development, so the parser is not decoration.
2. **Two axes.** SCC size is a lagging indicator — a new `services -> stores`
   import *inside* the 197-module blob changes its size by exactly zero. The
   per-pair edge count is the leading indicator, and a brand-new uphill pair
   fails on a single edge.
3. **Only uphill pairs are frozen.** Downhill counts are reported, never gated:
   freezing them would make every feature PR edit the baseline, and a baseline
   every PR edits is a merge conflict, not a review.

`--update-baseline` refuses to raise any value and refuses every cycle change;
`--init` is separate so "there is no baseline" cannot be confused with "reset
the ratchet".

## Acceptance criteria

- [x] The analyser reports static, lazy and combined measurements and excludes
      `import type`, inline `{ type X }`, `ImportTypeNode`, comment text, test
      files and declaration files
- [x] The baseline records the current state and only goes down
- [x] The gate fails on a new cycle, on a grown cycle and on a new uphill pair,
      and on an uphill pair that gained an edge — each verified against the real
      tree by adding the offending import and removing it again
- [x] `decide()` refuses to write while a regression exists; the refusal is
      tested, not just documented
- [x] The self-tests are mutation-checked: disabling the uphill-growth branch,
      the anchor-gone branch, the refusal, or the inline-type detection each
      turns the suite red
- [x] The baseline cannot be raised by hand: CI compares it against the merge
      base (`scripts/arch-baseline-guard.mjs`, job `arch-ratchet`) and fails on
      a raised pair, a new pair or grown cycle mass

## Review follow-ups

Raised by the code review of PR #4532 and fixed in the same branch:

- **The baseline could be raised in the same PR** — the gate compared the tree
  against a file that travelled with it, so "make the number match the
  regression" passed. `scripts/arch-baseline-guard.mjs` closes that: it reads
  the baseline from the merge base (not from `origin/develop`, so a branch that
  is merely behind does not look like a regression), fails on any raised uphill
  pair, on a pair that was absent there, and on grown cycle mass. Cycle *mass*
  rather than anchors, because an anchor is the alphabetically first member and
  a rename must not read as a regression. A missing history fails closed, which
  is what the new job's `fetch-depth: 0` is for.
- **An unresolved relative import failed open** — `import "./x.js"` for `x.ts`
  resolved to nothing, because a specifier names the built file. `resolveSpecifier`
  now rewrites `.js`/`.mjs`/`.svelte.js` to their TypeScript source, and an
  unresolved specifier that points into `src/` at a module-shaped path is a
  gate failure instead of an informational line. Assets (`.css`, `.json`,
  `?raw`) stay informational.
- **A computed `import()` was dropped silently** — the count is now reported
  (`computedLazy`), and a template literal *without* substitutions is treated
  as the static string it is, so `import(\`./x\`)` is a real edge.
- **`localeCompare` ordering** — replaced by code-unit order, so the baseline
  cannot differ between a laptop and CI for the same tree.
- **`shipped:` before the merge** — removed; it is set when the PR lands.

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
- `src/tests/architecture/cycle_ratchet.test.ts`, `scripts/arch-baseline-guard.mjs`
- `eslint.architecture.boundaries.js`
- `docs/ARCHITECTURE.md` — "Rules with teeth"
- `docs/backlog/bugs/BUG-0790-unreachable-modules-still-maintained.md` — the
  preceding cleanup that made the graph measurable at all
