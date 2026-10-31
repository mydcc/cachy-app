---
id: BUG-0728
title: Button variants drift from the semantic colour pairs in several themes
type: bug
status: done
priority: P2
milestone: none
created: 2026-10-22
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-0728 — Button variants drift from the semantic colour pairs in several themes

## Symptom

A control that reads its colour from the button primitive is not the colour the
same control used before the migration, and the size of the shift depends on the
theme. In the default theme the two families happen to agree closely enough that
nobody notices; in the themes below they do not.

The most visible case was on the order path: in `theme-matrix` the paper submit
(now `variant="success"`) rendered `#00802b` on `#00ff41`, **3.73:1** — below
WCAG 2.1 AA for normal text. FEAT-0612 fixed that one theme by setting
`--btn-success-text: var(--matrix-base)` (15.4:1, the old value); the
divergence that produced it is still there for every other theme and role.

## Evidence

**Demonstrated** by measuring the resolved pairs per theme (FEAT-0612 review):

| Theme | Role | Old semantic colour | New `--btn-*` pair |
| --- | --- | --- | --- |
| `github-dark` | accent (live CTA) | `#58a6ff` | `#238636` |
| `github-light` | accent (live CTA) | `#0969da` | `#1a7f37` |
| `VIP` | success (paper CTA) | `--lime-300` | `--green-500` |
| `gruvbox-dark` | success | bright variant | base variant |
| `matrix` | success | `#000` on `#00ff41` (15.4:1) | green on green (3.73:1) — fixed here |

## Cause

Every theme block declares `--btn-default/accent/danger/success-bg` and `-text`
independently of `--accent-color`, `--danger-color` and `--success-color`. The
old hand-written rules read the semantic tokens; the primitive reads the
`--btn-*` pairs. Nothing compares the two, and no test checks contrast on the
pairs, so a theme can ship a pair that is both different and unreadable.

`src/themes.css` — 28 theme blocks declare `--btn-default/accent/danger/success`
pairs; `--btn-warning-bg` is the one token that is *not* re-declared per theme.

## Fix

1. Add a test over every theme block: resolve each `--btn-*-bg` / `--btn-*-text`
   pair and assert `contrastRatio(...) >= 4.5` using
   [`src/lib/themeColors.ts:104`](../../../src/lib/themeColors.ts), with the
   primitive's 14 px/700 body size as the normal-text threshold. This is the
   gate that would have caught the matrix pair.
2. For each failing or drifting pair, either derive it from the semantic colour
   (preferred) or change the value so both families agree.
3. Where a divergence is intentional, record it next to the theme block with the
   ratio it produces.

## Acceptance criteria

- [x] A test resolves every `--btn-*-bg` / `--btn-*-text` pair in every theme
      block through the cascade and asserts `>= 4.5:1` at the primitive's
      14 px/700
- [x] Every pair below that threshold is fixed
- [x] Each theme that keeps a fill divergent from its semantic colour records
      the ratio next to the block
- [x] A pair restored to its pre-fix value turns the gate red (matrix success
      with `--green-400` on `--green-400`: `1.00:1`)

## Out of scope

- Changing the theme palettes themselves (`--green-*`, `--sky-*`, …). Only the
  `--btn-*` pairs and the test.
- The text variants (`ghost`, `ghost-danger`, `ghost-muted`), which read the
  semantic tokens directly and therefore do not drift.

## Links

- Found while migrating the calculator: [FEAT-0612](../features/FEAT-0612-adopt-the-button-primitive-in-the-calculator-and-trade-panel.md)
- Primitive: [FEAT-0610](../features/FEAT-0610-extend-and-adopt-the-button-primitive.md)
- Contrast helper: `src/lib/themeColors.ts`
