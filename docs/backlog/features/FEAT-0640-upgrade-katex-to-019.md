---
id: FEAT-0640
title: Upgrade katex to 0.19
type: feature
status: in-progress
priority: P3
assignee: opencode
milestone: none
editions: [community, pro, private]
area: deps
data_class: none
adr: none
depends_on: []
---

Branch: `chore/katex-019`

## Problem

`katex` is available at 0.19.0 (currently 0.18.10). It renders the maths in the
whitepaper, academy and guide pages, so the output is user-visible.

Used in three files:

- `src/utils/markdownUtils.ts` — via `marked-katex-extension`, with
  `throwOnError: false` and `displayMode: false`
- `src/components/shared/CandlestickPatternsView.svelte` and
  `src/components/shared/ChartPatternsView.svelte` — both import
  `katex/dist/katex.min.css`

## What was verified

- `npm run build` green. The direct CSS import is the thing a major could break
  by reshuffling `dist/`; `katex.min.css` is still where the imports expect it.
- Rendering compared against the 0.18.10 control through the real
  `renderSafeMarkdown` / `renderTrustedMarkdown` path, over six inputs: inline
  maths, display maths, a deliberately broken formula, plain markdown without
  maths, an `align` environment, and the trusted path. **All six produce
  byte-identical output.**

The broken-formula case is the one worth naming: `throwOnError: false` means a
malformed expression renders as an error string instead of throwing, and a major
that changed that default would have turned a bad formula in an article into a
500. It does not.

## Acceptance criteria

- [x] `katex` at `^0.19.0`, staying in `dependencies`
- [x] `npm run build` green
- [x] `katex/dist/katex.min.css` still resolves for both component imports
- [x] six representative renderings identical to 0.18.10
- [ ] `npm test` green — CI
- [ ] visual check of a maths-heavy page — recommended, not done here

## Notes

`markdownUtils.ts` has no test file. That is why this verification was done with
a throwaway probe rather than a pinned test: the behaviour is worth pinning, but
adding coverage for the markdown pipeline is its own decision and its own item,
not something to smuggle into a version bump.

## Out of scope

`intl-messageformat` 11 → 12, `negotiator` 0.6 → 1.1,
`lightweight-charts-indicators` 0.5 → 0.9, and
`conventional-changelog-conventionalcommits` 9 → 10 (blocked, see BUG-0639).
Each gets its own item.
