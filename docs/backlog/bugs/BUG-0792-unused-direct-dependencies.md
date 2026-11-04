---
id: BUG-0792
title: Six direct dependencies are unused but still installed
type: bug
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: deps
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: chore/dep-prune
shipped: PR #4517
---

# BUG-0792 — Six unused direct dependencies (w2-money, dependencies)

## Symptom

`package.json` lists six direct dependencies that nothing in the tree uses.
They are installed on every `npm ci`, including the production/build image, and
they widen the supply-chain surface for code that is never called.

## Evidence

Derived from the 2026-11-03 money audit (`w2-money` → "Ungenutzt / redundant"),
re-verified against `develop` at `72f3d72ec`:

| Package | Why it can go |
|---|---|
| `@semantic-release/changelog` | Not in `release.config.js`'s plugin list; `CHANGELOG.md` is curated by hand (BUG-0639) |
| `autoprefixer` | No `postcss.config.*` anywhere; Tailwind v4 prefixes through `@tailwindcss/vite` |
| `postcss` | No own PostCSS config; still present transitively via `vite` |
| `@vitest/ui` | No script passes `--ui` and no config sets `test.ui`; it is a standalone optional package, installable on demand |
| `@types/dompurify` | Deprecated stub on the registry; `dompurify` ships its own `d.ts` |
| `opencode-omniroute-auth` | No import in `src/`, `scripts/`, `server/` or CI; it belongs to the local agent harness, not the app |

## Cause

Each entry was added for a tool that has since changed shape (Tailwind v4
plugin, hand-curated changelog, `--ui` never adopted, `dompurify` type
bundling) and nothing removed it, because an unused dependency breaks nothing.

## Fix

Drop the six entries from `package.json` and regenerate `package-lock.json`
with `npm install --package-lock-only`. No source file changes.

## Acceptance criteria

- [x] None of the six appears in the lockfile's root `dependencies`
- [x] `npm ci` still installs a tree the build and the test suite can use
      (`pr-build.yml` runs `npm ci` → build → boot; green on this PR)
- [x] The lockfile diff contains only removals for those packages and their
      exclusive subtrees, plus the two `dev`/`optional` flag recalculations npm
      forces when a subtree loses its last prod/hard dependent (`escalade`,
      `@types/trusted-types`)

## Out of scope

- **Major upgrades**: `typescript` 7, `katex` 0.19, `three` 0.187 belong in
  FEAT-0224 / FEAT-0222, not in a prune.
- `conventional-changelog-conventionalcommits` stays blocked by BUG-0639.
- `npm audit`'s dev-toolchain advisories (undici, minimatch via
  `semantic-release`/`eslint`) are BUG-0302 and unchanged by this prune.

## Links

- `package.json`, `package-lock.json`
- `release.config.js`
- `docs/backlog/bugs/BUG-0639-*.md` (changelog preset blocked)
- `docs/backlog/features/FEAT-0264-test-deps-to-devdependencies.md` — its open
  question about `opencode-omniroute-auth` is answered here: no import anywhere,
  and its peer `@opencode-ai/plugin` was never installed, so the package could
  not have run from this tree. Decision: remove.
