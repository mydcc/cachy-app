---
id: FEAT-0644
title: Remove the orphaned lightweight-charts-indicators dependency
type: feature
status: done
priority: P3
assignee: opencode
milestone: none
editions: [community, pro, private]
area: deps
data_class: none
adr: none
depends_on: []
---

Branch: `chore/remove-lightweight-charts-indicators`

## Problem

This item was previously parked as "0.5 → 0.9, needs visual acceptance". That
blocker was wrong: the package is not used at all, and removing an unused
dependency has no visual surface.

### It was never imported

`git log -S "lightweight-charts-indicators" --pickaxe-regex -- "src/*"` returns
**no commits, ever**. Not a refactoring leftover, not an abandoned attempt —
speculative from the first commit that added it:

```
20c30b027 build: add lightweight-charts and related dependencies
```

"and related" is the whole story: it arrived as part of a bulk add.

Current references outside `package.json`:

- backlog docs listing it as pending
- `.claude/settings.local.json`, a permitted `curl` to its releases API
- a stale `build/client/` artifact from an earlier build

No static import, no dynamic `import()`, no re-export.

### Nothing depends on it

`npm ls lightweight-charts-indicators --all` shows a single leaf at top level
with no dependents.

### The chart code does not use it

Every chart import in `src` is from `lightweight-charts` itself — `CandleChartView.svelte`
(`createChart`, `IChartApi`), `indicatorLayer.ts` (`LineSeries`,
`HistogramSeries`), `seriesMap.ts`, `drawingPrimitive.ts`. There is **no plugin
registration** anywhere (`addPlugin` / `registerPlugin` return nothing), which is
how this library is normally consumed.

Indicators come from our own code: `JSIndicators` in `src/utils/indicators.ts`
(array-based pure math) plus the WASM module under `technicals-wasm/`.

### Its own peer requirement was never satisfied

0.10.0 declares `oakscriptjs: ">=0.10.1 <0.11.0"`. `oakscriptjs` is not in
`package.json` and not installed, so the package has been sitting in the tree
with an unmet peer condition for its whole life.

## What was verified

- `npm rm lightweight-charts-indicators`; lockfile has **zero** remaining
  entries for it.
- Unlike FEAT-0642, this one had **no** `vite.config.ts` references — no
  `optimizeDeps`, no `ssr.noExternal`, no chunking rule. The `chart-vendor`
  chunking rule targets `chart.js` / `chartjs-*`, a different package.
- Chart tests green: `src/lib/chart` + `CandleChartView.component.test.ts` —
  5 files, 101 tests. Coverage of the real indicator path is unchanged.
- `npm run build` green.

## Acceptance criteria

- [x] `lightweight-charts-indicators` gone from `package.json` and the lockfile
- [x] no config references to remove
- [x] chart tests green (101 tests)
- [x] `npm run build` green
- [ ] `npm test` green — CI

## Out of scope

`lightweight-charts` itself, which is genuinely used and stays at `^5.2.1`. Also
still open from the dependency series: `conventional-changelog-conventionalcommits`
(blocked, BUG-0639) and TypeScript 7 (blocked until 7.1).