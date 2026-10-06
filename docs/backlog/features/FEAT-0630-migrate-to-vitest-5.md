---
id: FEAT-0630
title: Migrate the test infrastructure to Vitest 5
type: feature
status: in-progress
priority: P2
assignee: opencode
milestone: none
editions: [community, pro, private]
area: deps
data_class: none
adr: none
depends_on: []
---

# FEAT-0630 — Migrate the test infrastructure to Vitest 5

Branch: `chore/vitest-5`

## Problem

`vitest` and `@vitest/ui` are available at 5.0.3 (currently 4.1.11). The
upgrade is not a version bump: Vitest 5 changes test-authoring semantics and
rewrites the benchmarking API, so 18 benchmark files and parts of
`vite.config.ts` have to change with it.

## Scope found while assessing the upgrade (2026-10-06)

- **Benchmark API rewrite.** `bench` is no longer a top-level import; it becomes
  a test-context fixture (`test('x', async ({ bench }) => …)`). 18 files import
  `bench` at module scope, across 27 `*.bench.ts` files. `bench.skip/.only/.todo`
  and `benchmark.compare` / `--compare` are removed.
- **`clearMocks` now defaults to `true`.** Nothing in the repo sets it, so the
  new default applies. Tests that record mock calls in `beforeAll` or a setup
  file and assert on them inside a test are the ones at risk.
- **Inline projects inherit the root config by default (`extends: true`).** Our
  two projects already set `extends: true` explicitly, so this is a no-op — but
  `sharedViteServer` (new, enabled by default) means the `unit` project now
  reuses the root Vite server instead of building its own. The `components`
  project overrides `resolve.conditions`, so it keeps its own server.
- **Unawaited async assertions now fail the test** (`resolves`, `rejects`,
  `toMatchFileSnapshot`) instead of printing a warning.
- **Artifacts moved to `.vitest/`.** `.gitignore` currently only has
  `.vitest-cache` and `coverage/`; the new directory needs ignoring.
- **Coverage `include`/`exclude` match more precisely** (relative paths, no
  picomatch `contains`), so the reported file set can shrink.
- **Hoisted `vi.mock`/`vi.unmock`/`vi.hoisted` must be top level** — nested
  calls now throw instead of warning. There are ~1125 `vi.mock` call sites in
  the suite, so this needs a real scan rather than an assumption.
- `test.sequential`/`describe.sequential` are removed — not used here.
- `VITEST_WORKER_ID`/`VITEST_POOL_ID` are 1-based — not used here.
- CI only runs `npm test`, so no reporter-flag fallout; `json`/`junit` reporters
  now write files instead of stdout, which nothing here depends on.

Prerequisites are satisfied: Vitest 5 needs Vite >= 6.4 and Node >= 22.12; the
repo is on Vite 8.3 with `.node-version` 26.8.1.

## Acceptance criteria

- [x] `vitest` and `@vitest/ui` at `^5.0.3` (lockfile updated)
- [x] All `*.bench.ts` files use the new benchmarking API
- [ ] `npm run benchmark:technicals` still runs — **blocked locally**, see state
- [ ] `npm test` green (both `unit` and `components` projects) — **blocked locally**, see state
- [x] No `vi.mock` call nested inside a `describe`/block (v5 throws on those)
- [x] `.vitest/` is gitignored
- [x] `npm run build` still green (`vite build`: ✓ built in 12.77s)
- [x] `clearMocks` pinned to `false` so the upgrade does not silently change
      mock semantics across the suite

## State (2026-10-06)

Migration is written and type-verified; the two runtime criteria could not be
executed here.

- 18 of the 27 `*.bench.ts` files used the removed module-scope `bench` import
  and were rewritten — 48 call sites. The other 9 files import nothing from
  Vitest (they are loose scripts with their own `performance.now()` timing) and
  were left untouched.
- `bench(NAME, FN, OPTIONS)` had to become `bench(NAME, OPTIONS, FN)`: v4 took
  the tinybench options last, v5 takes them second. One site
  (`storage.bench.ts`, `{ time: 500 }`) would have lost its options silently.
- Type proof, both directions: with Vitest 5 installed the unrewritten files
  fail with `TS2724: '"vitest"' has no exported member named 'bench'` (17
  errors); the rewritten ones have none. Total errors under a throwaway tsconfig
  that includes the benchmarks: 61 before, 44 after — the 17 that vanish are
  exactly those.
- The 44 remaining are pre-existing type looseness in files the project excludes
  from `npm run check` (`src/benchmarks/**`, `src/tests/**`, `tests/**`):
  Kline literals missing/over-typed fields, `marketWatcher_backfill.test.ts`
  missing `markPrice`. Not introduced here, not fixed here.
- Nested `vi.mock` scan over all 559 test files: 1124 call sites, 0 nested. The
  scanner was verified against planted violations before its result was trusted.
- `src/tests/performance/news_slice.bench.ts` had two separate `vitest` import
  statements; both were rewritten, producing a duplicate `test` identifier. Now
  one consolidated import.

**Blocked:** the suite cannot start in this environment — on Vitest 4 *and* 5.
Vite 8.3's dependency optimizer runs for the client environment with platform
`browser` and cannot resolve `node:module` inside Vite's own `rolldown/runtime.js`
("Tsconfig not found"); separately, oxc cannot load `$app/tsconfig` in the test
transform path. `vite build` is unaffected. Reproduced with `vitest@4.1.11`
installed, so it is not a Vitest 5 regression. Worth its own issue.

## Out of scope

Other pending majors: `typescript` 7 (waits for 7.1 and a stable compiler API),
`three` 0.186 and `@types/three` 0.186 (3D path, needs visual verification),
`jsdom` 30 (component-test environment), `katex` 0.19, `negotiator` 1.x,
`intl-messageformat` 12, `conventional-changelog-conventionalcommits` 10,
`lightweight-charts-indicators` 0.9. Each gets its own item.

Also out of scope: the env migration to `src/env.ts` + `$app/env/*`, which
replaces the `src/env-legacy.d.ts` bridge added in FEAT-0629.

## Open questions

- Do any tests depend on mock call history recorded in `beforeAll`? That is the
  main behavioural unknown from `clearMocks` flipping to `true`, and it is only
  observable by running the suite.
- Does `sharedViteServer` change anything for the `unit` project, given the
  root config's plugin branch keys off `process.env.VITEST`?

## Links

- Vitest 5 migration guide: https://vitest.dev/guide/migration
- `vite.config.ts`, `vitest.setup.ts`, `tests/benchmarks/`, `src/benchmarks/`
