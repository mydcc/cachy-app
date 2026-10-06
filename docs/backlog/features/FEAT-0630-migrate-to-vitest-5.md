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
- [x] Generated API shape runs green under Vitest 5 (probe, see state)
- [ ] `npm run check` green — left to CI, job "TypeScript Type Check". Dropped
      from the local checklist with a reason rather than quietly: svelte-check
      does not type-check test or benchmark files, so this migration cannot
      reach it.

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
installed, so it is not a Vitest 5 regression. Worth its own issue (#3897).

### Review findings, same day

A review pass over the diff produced two findings that needed fixing and one that
needed evidence.

**Fixed — indentation.** The codemod re-indented the `await bench(` line but
spliced each body in at its original absolute indentation, so files whose body
already sat +4 deep came out three levels deep: 48 sites split 33×+2, 3×+4, 10×+6,
2×+10. All 48 now sit at exactly +2 with the arrow function's closing brace level
with `await bench(`. Body-internal nesting was shifted, never rewritten — 48/48
sites intact, ESLint clean, no whitespace errors, type errors unchanged at 44.

**Fixed — the 9 files that are not benchmarks.** Evidence first, then the fix.
Vitest rejects a benchmark file without tests, exactly:

```
FAIL  |bench| empty.bench.ts [ empty.bench.ts ]
Error: No test suite found in file /tmp/opencode/probe/empty.bench.ts
```

Vitest 4.1.11 produces the identical error, so `npm run benchmark:technicals`
was already broken before this upgrade — 9 of its 27 files. They are standalone
scripts with hand-rolled `performance.now()` timing: one calls `process.exit(1)`,
one encodes a precision assertion, one interleaves setup between calls. Converting
them to real benchmarks is therefore not a mechanical wrap and belongs in its own
item; here they are taken out of benchmark collection via `benchmark.exclude`, so
the documented command runs the 18 real benchmarks and the scripts stay reachable
through `npx tsx`.

**Evidence — the generated shape runs.** Since the suite cannot start locally,
the generated shape was validated in a scratch project against Vitest 5.0.3:
sync benchmark, options in second position, awaited async benchmark, and
loop-registered tests — 5/5 green. That covers all four shapes the codemod emits.

**Still open — `sharedViteServer`.** v5 defaults it to true and the `unit` project
does not modify the Vite config, so it now reuses the root server and the root
config runs once instead of once per project. If `npm test` fails in CI, this is
the first lever to try (`sharedViteServer: false`), not the last.

**Still open — `vitest.perf.config.ts`.** The only CI job that touches it runs
`npm run test:perf` under `continue-on-error: true`, so a break there shows up
nowhere but the job log. That config merges `vite.config.ts`, which defines
`test.projects`, and Vitest 5 changed how projects merge with a root config.

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
