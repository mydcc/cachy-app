---
id: FEAT-0338
title: Core Utility Upgrade
type: feature
status: in-progress
assignee: pheinze
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [FEAT-0337]
parent: FEAT-0336
estimate: 3
size: S
---

# FEAT-0338 — Core Utility Upgrade

## Problem

Bestehende Utility-Klassen in `themes.css` (`.input-field`, `.btn-*`, `.glass-panel`) haben kein einheitliches border-radius, padding oder font-size. Sie nutzen die neuen Design-Tokens aus FEAT-0337 nicht.

## Proposal

Alle bestehenden Utility-Klassen in `themes.css` (ca. Zeile 2200-2910) auf die neuen `--radius-*`, `--space-*`, `--text-*` Tokens umstellen:

### Eingabe-Felder

- `.input-field`: `border-radius: var(--radius-md)`, `padding` via `--space-*`
- `.input-field-sm`: `font-size: var(--text-xs)`, konsistentes padding
- `.input-label`: `font-size: var(--text-sm)`, evtl. `font-weight: var(--font-medium)`
- `.input-wrapper`: einheitliches handling

### Buttons

- `.btn-switcher`: `border-radius: var(--radius-lg)`
- `.btn-primary-action`, `.btn-secondary-action`: `border-radius: var(--radius-md)`, `padding: var(--space-2) var(--space-4)`
- `.btn-icon-accent`, `.btn-lock-icon`: konsistente `font-size` via Token
- `.btn-modal-ok`: `border-radius: var(--radius-md)`

### Glass & Panel

- `.glass-panel`: `border-radius: var(--radius-lg)`

### Sonstige

- `.trade-type-switch button`: `border-radius: var(--radius-md)`
- `.text-link`: `font-size: var(--text-sm)`

## Acceptance criteria

- [ ] `.input-field` nutzt `--radius-md` statt hardcoded Wert
- [ ] `.btn-*`-Klassen haben einheitlichen Radius via Token
- [ ] `.glass-panel` hat `border-radius: var(--radius-lg)`
- [ ] `npm run check` bestanden
- [ ] `npm test` bestanden
- [ ] Keine sichtbaren visuellen Regressionen in Calculator, Trade Panel, Settings

## Out of scope

- Keine neuen Utility-Klassen (separates Child)
- Keine Komponenten-Migration (separates Child)

## Links

- `src/themes.css` — Zeilen 2200-2910 (Utility-Klassen)
- FEAT-0337 — Design Token Foundation (Voraussetzung)