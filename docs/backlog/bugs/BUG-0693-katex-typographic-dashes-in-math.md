---
id: BUG-0693
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

# BUG-0693 — KaTeX warns about every typographic dash inside an AI answer's formulas

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

## Fix

`src/utils/markdownUtils.ts` gains `normalizeMathDashes()`, called by both
render paths before `marked.parse`. One scan matches, in order of precedence,
fenced blocks, inline code, display math and inline math; only the math matches
have their inner dashes rewritten. Code is skipped because a `$` in a fence is
not math, and the one shape the scan cannot see through — an *unclosed* fence or
inline-code span — is documented at the function.

## Verification

`src/utils/markdownUtils.test.ts` (new) covers inline math, display math, the
U+2212 minus, prose, fenced and inline code, several spans on one line, and an
unmatched `$`. `renderTrustedMarkdown("**Range** $BTC–USDT$")` asserts the
rendered output contains KaTeX and no longer contains the en dash — verified red
by dropping the call from the renderer.
