# ADR-0014: Layout design tokens are the single source for radius, spacing and type scale
- **Status:** Proposed
- **Date:** 2026-09-02
- **Deciders:** Pat (product owner)

## Context

Cachy's 157 Svelte components style themselves from `<style>` blocks. `src/themes.css` defines color, shadow, motion and z-index tokens, but **no tokens for border-radius, spacing/padding, font-size or font-weight**. Every agent building a UI element invents its own values.

Evidence from `src/components/`:
- `border-radius`: `0`, `0.375rem`, `0.5rem`, `0.75rem`, `8px`, `4px`, `12px`, `50%` — 8 values with no system
- `font-size`: `0.625`, `0.6875`, `0.7`, `0.75`, `0.8125`, `0.875`, `1.125rem` — 7 arbitrary values

The result: Cachy's colors are consistent, but its geometry and typography are not. This is tracked by [FEAT-0336](backlog/features/FEAT-0336-css-design-token-foundation.md) and its children.

## Decision

Define layout token scales in `:root, .theme-default` in `src/themes.css`, and mirror them in Tailwind's `@theme` block in `src/app.css` so both `var(--token)` and Tailwind utilities (`rounded-*`, `p-*`, `text-*`) resolve to the same values.

The scales (token name → value):

```css
/* Radius */
--radius-sm: 0.25rem;   /* 4px */
--radius-md: 0.375rem;  /* 6px */
--radius-lg: 0.5rem;    /* 8px */
--radius-xl: 0.75rem;   /* 12px */
--radius-full: 9999px;  /* pills, circles */

/* Spacing (8-point grid) */
--space-1: 0.25rem;  /* 4px */
--space-2: 0.5rem;   /* 8px */
--space-3: 0.75rem;  /* 12px */
--space-4: 1rem;     /* 16px */
--space-5: 1.25rem;  /* 20px */
--space-6: 1.5rem;   /* 24px */
--space-7: 1.75rem;  /* 28px */
--space-8: 2rem;     /* 32px */

/* Font size */
--text-xs: 0.75rem;    /* 12px */
--text-sm: 0.875rem;   /* 14px */
--text-base: 1rem;     /* 16px */
--text-lg: 1.125rem;   /* 18px */
--text-xl: 1.25rem;    /* 20px */
--text-2xl: 1.5rem;    /* 24px */

/* Font weight */
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;
```

Any new or existing component layout value that is not one of these tokens is a violation, reviewable in a diff.

## Consequences

### What this enables
- One look-up point for "how big should this be" — an agent building a new element reads the scale instead of inventing a value.
- Tailwind utilities become consistent with the semantic tokens.
- A future redesign changes one file, not 157.

### What this costs
- Existing hardcoded values must migrate gradually (FEAT-0338, FEAT-0340); until then, two systems coexist.
- A visual diff: rounding existing arbitrary values (e.g. `0.4rem` → `--radius-md`) moves pixels by ≤2px. Some E2E screenshots will need re-baselining.
- Two sources to keep in sync: `themes.css` and the `@theme` block in `app.css`.

### What is now forbidden
- Hardcoding `border-radius`, `font-size`, `padding`/`margin` (as discrete layout values) with a number that does not correspond to a token in this scale. Exceptions: `border-radius: 0` (sharp edges), `border-radius: 50%` (circles/avatars), chart/canvas-internal labels.
- Adding a new token value outside the scale without an ADR update — the scales above are the closed set.

## Alternatives considered
- **No tokens, just document conventions in CLAUDE.md.** Rejected: documentation drifts; tokens are checkable in a diff.
- **Tailwind-only (utilities everywhere, no semantic vars).** Rejected: 157 components already use `var(--…)` heavily and some UI is not Tailwind-authored; semantic vars keep the existing color pattern.
- **Full component kit (`.card`, `.btn` etc. as mandatory classes).** Rejected for now: larger refactor (FEAT-0339) can follow later; tokens are the prerequisite for any of it.
