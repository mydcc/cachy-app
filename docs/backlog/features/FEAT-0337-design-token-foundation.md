---
id: FEAT-0337
title: Design Token Foundation
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: ADR-0014
depends_on: []
parent: FEAT-0336
estimate: 2
size: S
---

# FEAT-0337 — Design Token Foundation

## Problem

Es gibt keine zentralen CSS-Variablen für border-radius, spacing, font-size und font-weight. Jeder Agent/Entwickler definiert eigene Werte in `<style>`-Blöcken, was zu inkonsistenter UI führt.

## Proposal

Design-Token-Skalen in `src/themes.css` im `:root`-Block einführen und im Tailwind v4 `@theme`-Block in `src/app.css` spiegeln, damit Tailwind-Utilities (`rounded-*`, `p-*`, `text-*`) konsistent nutzbar sind.

### Radius-Skala

```css
--radius-sm: 0.25rem;   /* 4px */
--radius-md: 0.375rem;  /* 6px */
--radius-lg: 0.5rem;    /* 8px */
--radius-xl: 0.75rem;   /* 12px */
--radius-full: 9999px;  /* Pill/Full */
```

### Spacing-Skala (8er-System)

```css
--space-1: 0.25rem;  /* 4px */
--space-2: 0.5rem;   /* 8px */
--space-3: 0.75rem;  /* 12px */
--space-4: 1rem;     /* 16px */
--space-5: 1.25rem;  /* 20px */
--space-6: 1.5rem;   /* 24px */
--space-7: 1.75rem;  /* 28px */
--space-8: 2rem;     /* 32px */
```

### Font-Size-Skala

```css
--text-xs: 0.75rem;    /* 12px */
--text-sm: 0.875rem;   /* 14px */
--text-base: 1rem;     /* 16px */
--text-lg: 1.125rem;   /* 18px */
--text-xl: 1.25rem;    /* 20px */
--text-2xl: 1.5rem;    /* 24px */
```

### Font-Weight

```css
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;
```

## Acceptance criteria

- [ ] Alle Tokens (radius, space, text, font-weight) in `:root, .theme-default` definiert
- [ ] Tokens im `@theme`-Block in `app.css` gespiegelt (`--radius-*` → `--radius-*`, `--space-*` → `--spacing-*`, `--text-*` → `--font-size-*`, `--font-*` → `--font-weight-*`)
- [ ] `npm run check` bestanden
- [ ] Keine sichtbaren visuellen Änderungen (Token-Foundation ändert keine bestehenden Nutzungen)

## Out of scope

- Keine Migration bestehender Komponenten (separates Child)
- Keine Utility-Klassen (separates Child)

## Links

- `src/themes.css` — `:root`-Block, ca. Zeile 23-181
- `src/app.css` — `@theme`-Block, ca. Zeile 29-73