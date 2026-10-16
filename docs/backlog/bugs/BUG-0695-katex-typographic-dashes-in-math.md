---
id: BUG-0695
title: KaTeX warns about every typographic dash inside an AI answer's formulas
type: bug
status: done
assignee: opencode
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-0695 — KaTeX warns about every typographic dash inside an AI answer's formulas

## Symptom

Every assistant answer that writes a range inside math — `$BTC–USDT$` — logs
`LaTeX-incompatible input and strict mode is set to 'warn': Unrecognized Unicode
character "–" (8211)` once per dash. The answer renders, but the console fills
with warnings that look like a defect in the app.

## Evidence

**Demonstrated** — observed in the browser console on `dev.cachy.app` while
testing the assistant (screenshot in the incident thread), and reproduced in
`src/utils/markdownUtils.test.ts`.

KaTeX's strict mode warns about `–` (U+2013), `—` (U+2014), `‒` (U+2012),
`―` (U+2015) and `−` (U+2212) inside math. A model writing a range picks the
typographic dash because the *prose* around it wants one.

## Acceptance criteria

- [x] A typographic dash inside `$…$` or `$$…$$` is rewritten to `-` before KaTeX sees it.
- [x] A dash in prose is left alone.
- [x] Fenced code and inline code are never rewritten.
- [x] An escaped `\$` is not a delimiter, so `Preis \$100 – \$200` keeps its typography.
- [x] Both render paths are covered — the assistant's own (`renderSafeMarkdown`)
      as well as the documentation one.

## Fix

`src/utils/markdownUtils.ts` gains `normalizeMathDashes()`, called by both
render paths before `marked.parse`. One scan matches, in order of precedence,
fenced blocks, inline code, display math and inline math; only the math matches
have their inner dashes rewritten, and a delimiter never counts when it is
escaped (`\$`). Code is skipped because a `$` in a fence is not math. The shapes
the scan cannot see through — an *unclosed* fence or inline-code span,
double-backtick inline code and 4-space-indented blocks, all cosmetic — are
documented at `MATH_SEGMENT`.

## Verification

`src/utils/markdownUtils.test.ts` (new) covers inline math, display math, the
U+2212 minus, prose, fenced and inline code, several spans on one line, an
unclosed `$` (`"$5–6 off"` is left alone) and an escaped `\$`. A second case
records the intended behaviour of a *second* `$`: `"$5 – $6 too"` is a math span
for the renderer, so rewriting it is correct, not a miss.

Both render paths are pinned: `renderTrustedMarkdown("**Range** $BTC–USDT$")`
asserts KaTeX output without the en dash, and `renderSafeMarkdown(…)` — the path
the assistant uses — asserts the rendered text carries no en dash either. The
test file runs under `happy-dom` for that second assertion. Verified red by
dropping the normalization from `renderSafeMarkdown` alone, which is the exact
gap an earlier version of this file had (it exercised only the documentation
renderer).
