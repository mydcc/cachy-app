---
id: FEAT-0339
title: Shared Component Classes
type: feature
status: done
assignee: pheinze
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [FEAT-0337]
parent: FEAT-0336
estimate: 2
size: S
---

# FEAT-0339 — Shared Component Classes

## Problem

Es gibt keine zentralen CSS-Klassen für wiederkehrende UI-Patterns wie Cards, Badges oder Dividers. Jede Komponente definiert ihre eigene Variante, was zu Inkonsistenzen führt.

## Proposal

Minimalen Satz an gemeinsamen Utility-Klassen in `themes.css` definieren, die von mehreren Komponenten genutzt werden können:

### `.card`

Einheitlicher Container für Karten-Layouts:
```css
.card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
}
```

### `.badge`

Kleine Status-/Label-Elemente:
```css
.badge {
  display: inline-flex;
  align-items: center;
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
  padding: var(--space-1) var(--space-2);
}
```

Varianten: `.badge-success`, `.badge-danger`, `.badge-warning`, `.badge-accent` — nutzen bestehende `.bg-*-paired`-Farben.

### `.divider`

Horizontaler Trenner:
```css
.divider {
  height: 1px;
  background: var(--border-color);
  margin: var(--space-3) 0;
}
```

### `.chip` (optional)

Tag-/Filter-Chips:
```css
.chip {
  display: inline-flex;
  align-items: center;
  border-radius: var(--radius-full);
  font-size: var(--text-sm);
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--border-color);
}
```

## Acceptance criteria

- [x] `.card` definiert (Radius, Padding, Hintergrund, Border via Tokens)
- [x] `.badge` + `.badge-*`-Varianten definiert
- [x] `.divider` definiert
- [x] `npm run check` bestanden
- [x] Keine visuellen Regressionen (neue Klassen, keine Änderungen an bestehenden)

## Out of scope

- Keine Migration bestehender Komponenten auf die neuen Klassen
- Keine JS-Komponenten (nur CSS-Klassen)

## Links

- `src/themes.css` — existiert bei ~2900 (glass-panel), neue Klassen am Ende
- FEAT-0337 — Design Token Foundation (Voraussetzung)