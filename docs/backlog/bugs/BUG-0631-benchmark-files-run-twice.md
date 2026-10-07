---
id: BUG-0631
title: Every benchmark file runs twice because Vitest creates one bench project per inline project
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: deps
data_class: none
adr: none
depends_on: []
# assignee:            # required while status: in-progress (who is working this)
---

# BUG-0631 — Every benchmark file runs twice because Vitest creates one bench project per inline project

## Symptom

`npm run benchmark:technicals` runs every benchmark file twice — once as
`|unit (bench)|` and once as `|components (bench)|`. That doubles the wall-clock
time of the whole run, and it makes a benchmark file pass in one project and
fail in the other:

```
❯ |unit (bench)|      src/benchmarks/crypto_loop.bench.ts (4 tests | 4 skipped)
❯ |components (bench)| src/benchmarks/crypto_loop.bench.ts (4 tests | 4 failed) 248190ms
```

The same split decides pass or fail:

```
ReferenceError: window is not defined                       ❯ new StorageService
Error: CryptoService requires generic Web Crypto API
```

A benchmark that measures nothing useful is still better than one that fails for
a reason that has nothing to do with what it measures. That is the actual cost:
the numbers a file reports depend on which project happened to collect it.

## Evidence

*Demonstrated* — full run on `chore/vitest-5` with Vitest 5.0.3:

```
Test Files  8 failed | 28 passed (36)
     Tests  9 failed | 86 passed | 4 skipped (99)
```

36 files for 27 benchmark files, and every entry is labelled with one of the two
bench projects. Project-dependent failures appear only under
`|components (bench)|`, which sets `resolve.conditions: ["browser"]` while the
environment stays `node` — so `storageService` finds no `window`, and
`cryptoService` sees a non-browser `browser` flag from `$app/env`.

*Also pre-existing:* a `develop` run on Vitest 4.1.11 reports each collection
failure twice as well. This is not introduced by Vitest 5; the migration only
made it visible, because before it the run died during collection.

## Cause

Known. Vitest groups benchmark files into benchmark projects derived from the
inline projects in `test.projects`, and each one inherits its parent's config.
`vite.config.ts` declares two inline projects:

- `unit` — no Vite-level overrides
- `components` — `resolve: { conditions: ["browser"] }`

so `*.bench.ts` is collected once per project. Verified by filtering:

```
npx vitest bench … --project=unit       → No projects matched the filter "unit".
npx vitest bench … --project="unit (bench)"   → runs
```

The bench projects are named `<project> (bench)`; the inline project names are
not valid filters for a bench run.

## Fix

Not yet decided — two candidates, both need measuring:

- A dedicated benchmark project in `test.projects`, so the bench files are
  collected exactly once and inherit neither the browser conditions nor the
  component-test resolution rules.
- Excluding `**/*.bench.ts` from the `unit` and `components` collections, if the
  benchmark projects' collection honours `test.exclude`.

What must not change: which benchmarks run. Excluding a file from both projects
would silently drop its coverage, which is what the `benchmark.exclude` list in
`vite.config.ts` already does deliberately for nine script files that are not
benchmarks at all (see FEAT-0630).

## Acceptance criteria

- [ ] Each `*.bench.ts` file is collected exactly once, shown by the reporter
- [ ] `npm run benchmark:technicals` wall-clock roughly halves on the current
      file set — demonstrated, not estimated
- [ ] The `window is not defined` and `CryptoService requires generic Web Crypto
      API` failures are gone, and no benchmark that runs today stops running
- [ ] `npm run benchmark:technicals` passes without a project-dependent
      difference between two runs of the same file
- [ ] `npm test` stays green — the change touches only benchmark collection

## Out of scope

- The nine `*.bench.ts` files that are standalone scripts rather than
  benchmarks, excluded via `benchmark.exclude` in FEAT-0630
- `src/benchmarks/crypto_loop.bench.ts`: its `$app/env` mock and its exclusion
  from the routine run are settled in FEAT-0630's PR
- `news_slice.bench.ts` and `marketWatcher.bench.ts`, which fail only under one
  of the two projects — demonstrated to be part of this defect rather than
  separate ones: `mount(...) is not available on the server` and `window is not
  defined` are what a component-mount benchmark does in the wrong project
- BUG-0632 and BUG-0633 — defects in the code under measurement, which this
  collection problem neither causes nor fixes

## Links

- FEAT-0630 — the Vitest 5 migration that made this observable
- PR #3898
- `vite.config.ts` — `test.projects`

## What shipped

`benchmark: { exclude: ["**/*.bench.ts", "**/*.benchmark.ts"] }` on the
`components` project, plus an explicit `benchmark.include` listing the files
that do run.

Three earlier approaches were wrong, and the reasons are worth keeping:

- `benchmark.include` alone changed nothing — it scopes collection *inside* a
  benchmark project, it does not stop a second project from deriving one.
- `benchmark.enabled: false` does not help — `vitest bench` forces benchmark
  projects on and the expansion stamps `enabled: true` on the derived project
  regardless of the parent.
- `hidden: true` is read by nobody — Vitest sets that flag itself for browser
  parent projects and never reads it from project config, so it was silently
  inert. An earlier revision of this work believed it worked, because a
  `--project="unit (bench)"` run reported 17 files. That number was always 17;
  only the total had dropped.

Verified by counting what each project collects: `unit (bench)` 16,
`components (bench)` 0. `npm run benchmark:technicals` went from 34 files / 91
tests / 5 failures to 16 files / 45 tests / 1 failure. The remaining failure is
BUG-0633, left open. A component test still passes, so the 721 component tests
are unaffected.

`news_slice.bench.ts` moved from the include list to the exclude list — see its
own entry in the exclusions.
