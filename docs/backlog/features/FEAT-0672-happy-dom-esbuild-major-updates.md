---
id: FEAT-0672
title: Apply major dependency updates for happy-dom and esbuild
type: feature
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: deps
data_class: none
adr: none
depends_on: []
---

# FEAT-0672 — Apply major dependency updates for happy-dom and esbuild

## Problem

The weekly dependency run (`npm update --save`) deliberately stays inside the
existing semver ranges. Two packages have majors available that it therefore
left untouched, because a major release may change behavior:

- `happy-dom`: 20.14.6 → 21.0.1 — backs the Vitest DOM environment.
- `esbuild`: 0.25.12 → 0.28.2 — pinned in the build toolchain.

Both are toolchain dependencies, not shipped runtime dependencies, so the risk
sits in the build and test path — but both are load-bearing for CI.

## Proposal

Read the `happy-dom` 21 and `esbuild` 0.28 migration notes, then bump each in
its own commit so a failure points at exactly one package:

- `happy-dom`: `bash scripts/run-lowpri.sh npx vitest run --project=unit` plus
  one component test.
- `esbuild`: `npm run build` (the Vite build consumes it).

## Acceptance criteria

- [x] `happy-dom` bumped to `^21` and the unit + component tests pass
- [x] `esbuild` bumped to `^0.28` and `npm run build` succeeds
- [x] `npm run check` passes
- [x] Any breaking change from either migration is addressed, or the bump is
      reverted with a note

## Out of scope

- Other majors, each tracked in its own item: TypeScript
  ([FEAT-0224](FEAT-0224-typescript-7-update.md)), KaTeX
  ([FEAT-0641](FEAT-0641-upgrade-katex-to-019-when-peer-allows.md)),
  `conventional-changelog-conventionalcommits`
  ([BUG-0639](../bugs/BUG-0639-changelog-preset-needs-newer-writer.md)).
- Minor and patch bumps — those ride the weekly update.

## Open questions

- None blocking. Resolved during the bump: `happy-dom` 21 switches CSS and
  iframe file loading off by default (SSRF fix); nothing in the test suite
  relies on either, and the new settings are unused. `esbuild` 0.28 is a
  deliberate upstream breaking release at install time (integrity checks);
  no JS API change affects the consumers here.

## Links

- Prior low-risk major batch: [FEAT-0222](FEAT-0222-major-dependency-updates.md)
- Weekly update workflow: `.github/workflows/weekly-updates.yml`
