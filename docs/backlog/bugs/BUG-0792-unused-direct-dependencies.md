---
id: BUG-0792
title: Six direct dependencies are unused but still installed
type: bug
status: in-progress
priority: P3
milestone: none
editions: [community, pro, private]
area: deps
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: chore/dep-prune
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
| `@vitest/ui` | No script passes `--ui`; `vitest` pulls it transitively if someone wants it |
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

- [ ] None of the six appears in the lockfile's root `dependencies`
- [ ] `npm ci` still installs a tree the build and the test suite can use
- [ ] The lockfile diff contains only removals for those packages and their
      exclusive subtrees

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
