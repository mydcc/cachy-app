---
id: BUG-0760
title: Hover states and mixed semantic/button pairs fall outside the contrast gate
type: bug
status: specced
priority: P3
milestone: none
created: "2026-10-31"
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [BUG-0728]
---

# BUG-0760 — Hover states and mixed semantic/button pairs fall outside the contrast gate

## Symptom

A filled button can clear AA at rest and drop below it on hover, and a control
that paints a semantic fill with a `--btn-*` text token can be unreadable even
though both families pass on their own. BUG-0728's gate measures only the
resting `--btn-*-bg` / `--btn-*-text` pair, so neither case turned it red.

## Evidence

**Demonstrated** with the resolver introduced in BUG-0728, against
`src/themes.css` after that fix:

- **17 hover pairs** (same label, `--btn-*-hover-bg`) are below 4.5:1. Worst:
  `solarized-dark` default 2.01:1, `gruvbox-dark` danger 3.14:1, `night-owl`
  default 3.15:1, `meteorite` accent 3.34:1, `github-dark` danger 3.35:1 and
  accent 3.37:1.
- **8 mixed pairs** (semantic fill + the role's `--btn-*-text`) are below
  4.5:1: `github-dark` accent `--accent-color` with `--btn-accent-text`
  2.53:1, `VIP` danger 2.75:1, the default theme's danger 3.05:1,
  `gruvbox-dark` danger 3.14:1, `github-dark` danger 3.35:1, `cobalt2` danger
  3.86:1, `matrix` danger 4.00:1, `obsidian` accent 4.01:1.
- One raw rule composes the same shape outside the token system:
  `.theme-solarized-light .trade-type-switch button.long.active` paints
  `--base04` on `--success-color`, 2.11:1 (`src/themes.css`).

The mixed pairs are live: 45 Svelte sites reference `--btn-*-text` directly,
usually as `bg-[var(--accent-color)] text-[var(--btn-accent-text)]`.

## Cause

The gate enumerates `-bg` and follows `var()` chains, but it does not know
which second state or which cross-family combination a caller composes. The
primitive's hover rule changes only the background, and components outside the
primitive assemble their own pair from the two families.

## Fix

1. Extend `src/themes.buttonContrast.test.ts` with a state list
   (`bg`, `hover-bg`) so hover is measured like rest. Two `midnight` hover
   tokens are `color-mix()`; either resolve them or exempt them explicitly
   with a reason, and do not let `parseColorToRgb` grade them as RGB runs.
2. Measure the documented mixed combinations (semantic fill + role text) in the
   same test, and migrate the raw `bg-[var(--accent-color)]
   text-[var(--btn-accent-text)]` call sites to the primitive's variants.
3. Give the `solarized-light` active-toggle rule a pair that clears AA, or
   move it onto the same tokens.

## Out of scope

- Changing the theme palettes (`--green-*`, `--sky-*`, …).
- Re-testing the resting pair, which BUG-0728 already gates.

## Links

- BUG-0728 — the resting-pair gate this extends
- BUG-0759 — the fifth filled role, which has no text token yet
- `src/themes.buttonContrast.test.ts`
