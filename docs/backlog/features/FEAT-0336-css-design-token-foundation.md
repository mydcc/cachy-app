---
id: FEAT-0336
title: CSS Design Token Foundation & UI Harmonization
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: ADR-0014
depends_on: []
estimate: 15
size: L
---

# FEAT-0336 — CSS Design Token Foundation & UI Harmonization

## Problem

Cachy hat 157 Svelte-Komponenten mit `<style>`-Blöcken, aber keine zentralen Design-Tokens für Layout-Eigenschaften. `src/themes.css` definiert nur Farb-, Schatten-, Motion- und Z-Index-Tokens. **border-radius, spacing/padding, font-size und font-weight** haben keine Token-Skala — jeder Agent, der ein UI-Element baut, definiert eigene Werte aus dem Nichts.

Belege aus `src/components/`:
- `border-radius: 0 / 0.375rem / 0.5rem / 0.75rem / 8px / 4px / 12px / 50%` — 8 verschiedene Werte ohne System
- `font-size: 0.625 / 0.6875 / 0.7 / 0.75 / 0.8125 / 0.875 / 1.125rem` — 7 willkürliche Werte nebeneinander

Das Ergebnis: Cachy fühlt sich "zusammengestückelt" an, obwohl die Farben stimmen.

## Proposal

Dies ist ein **EPIC** mit vier Child-Features:

| Child | Beschreibung | Status |
|---|---|---|
| [FEAT-0337](FEAT-0337-design-token-foundation.md) | Design Token Foundation — `--radius-*`, `--space-*`, `--text-*`, `--font-*` Skalen | Specced |
| [FEAT-0338](FEAT-0338-core-utility-upgrade.md) | Core Utility Upgrade — `.input-field`, `.btn-*`, `.glass-panel` auf Token | Specced |
| [FEAT-0339](FEAT-0339-shared-component-classes.md) | Shared Component Classes — `.card`, `.badge`, `.divider` | Specced |
| [FEAT-0340](FEAT-0340-component-style-migration.md) | Component Migration — 157 Komponenten `<style>`-Blöcke auf Token | Specced |

**Nicht-Ziele:** Kein neues Theme-System, kein Tailwind-Update, kein Daten-/Business-Logik-Refactoring.

## Acceptance criteria

- [ ] [FEAT-0337](FEAT-0337-design-token-foundation.md) — Design Token Foundation (S, ~2 SP)
- [ ] [FEAT-0338](FEAT-0338-core-utility-upgrade.md) — Core Utility Upgrade (S-M, ~3 SP)
- [ ] [FEAT-0339](FEAT-0339-shared-component-classes.md) — Shared Component Classes (S, ~2 SP)
- [ ] [FEAT-0340](FEAT-0340-component-style-migration.md) — Component Migration (M-L, ~8 SP)
- [ ] Unsichtbare visuelle Regression in Calculator, Trade Panel, Settings, Journal
- [ ] `npm run check` bestanden nach jedem Child
- [ ] `npm test` bestanden nach jedem Child

## Out of scope

- Jedes Child hat sein eigenes Out of Scope.
- Kein Code außerhalb von `src/themes.css`, `src/app.css`, `src/components/`

## Open questions

- **Braucht das Token-System ein ADR?** — Ein Design-Token-System ist eine Entscheidung, die künftige Arbeit constraint (CLAUDE.md: "New decision that constrains future work → ADR"). Andererseits: keine Daten- oder API-Änderung, kein semantisches BREAKING. Ein ADR könnte die Token-Werte und die Entscheidung für ein 8er-System dokumentieren.
- **In welches Milestone fällt das?** — Kein Breaking, kein API-Contract — aber hoher visueller Impact. M4? M5?

## Links

- [CLAUDE.md](../../CLAUDE.md) — siehe Theming, Financial Data, Svelte 5 Rules
- [src/themes.css](../../src/themes.css) — Hauptdatei, 20 Themes + Utility-Klassen
- [src/app.css](../../src/app.css) — Tailwind v4 @theme-Block, Font-Faces, Scrollbar
- [FEAT-0337](FEAT-0337-design-token-foundation.md) — Token Foundation (S, children: —)
- [FEAT-0338](FEAT-0338-core-utility-upgrade.md) — Core Utility Upgrade (S-M, depends_on: FEAT-0337)
- [FEAT-0339](FEAT-0339-shared-component-classes.md) — Shared Component Classes (S, depends_on: FEAT-0337)
- [FEAT-0340](FEAT-0340-component-style-migration.md) — Component Migration (M-L, depends_on: FEAT-0338)