---
id: FEAT-0340
title: Component Style Migration
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [FEAT-0338]
parent: FEAT-0336
estimate: 8
size: L
---

# FEAT-0340 — Component Style Migration

## Problem

157 Svelte-Komponenten haben `<style>`-Blöcke mit hardcoded border-radius, font-size, padding/margin. Die Werte sind inkonsistent über die gesamte App verteilt. Nachdem Token-Skala (FEAT-0337) und Utility-Klassen (FEAT-0338, FEAT-0339) bereitstehen, müssen die Komponenten auf das neue System umgestellt werden.

## Proposal

Schrittweise Migration der `src/components/`-Svelte-Komponenten in mehreren PRs:

1. **Calculator-Panel** (ca. 15 Komponenten) — höchste Sichtbarkeit, sofortige Wirkung
2. **Trade Panel** (ca. 20 Komponenten) — zweithöchste Priorität
3. **Settings** (ca. 15 Komponenten) — viele Formulare, Inputs
4. **Shared** (ca. 10 Komponenten) — Badge, Modal, Leverage, etc.
5. **Results** (ca. 10 Komponenten) — PlaceOrder, TpSlList, etc.
6. **Rest** (ca. 25 Komponenten) — Nav, Layout, Chat, etc.

Pro PR: 10-15 Komponenten. Pro Komponente:
- Hardcoded `border-radius` → `var(--radius-*)` (nach Kontext: sm/md/lg/xl/full)
- Hardcoded `font-size` → `var(--text-*)` (nächstpassende Stufe)
- Hardcoded `padding`/`margin` → `var(--space-*)` (wo sinnvoll, auf 8er-Skala runden)
- Wo möglich: Utility-Klassen statt `<style>`-Block verwenden (`.card`, `.badge`)

## Acceptance criteria

- [ ] Alle `src/components/`-Svelte-Komponenten nutzen Design-Tokens für border-radius, font-size, spacing
- [ ] Keine hardcoded `border-radius`-Werte mehr in `<style>`-Blöcken (Ausnahme: `50%` für Kreise, `0` für edges)
- [ ] Keine hardcoded `font-size`-Werte mehr in `<style>`-Blöcken (Ausnahme: spezielle Chart/Canvas-Labels)
- [ ] `npm run check` bestanden
- [ ] `npm test` bestanden
- [ ] `npm run test:e2e` bestanden — visuelle Regression per Screenshot-Vergleich
- [ ] Calculator, Trade Panel, Settings sehen vorher/nachher gleich aus (bis auf Mikro-Pixel-Differenzen durch gerundete Werte)

## Visual Regression

- Vor jedem PR: Playwright-Screenshots der betroffenen Komponenten
- Nach PR: Vergleich mit `expect().toMatchSnapshot()`
- Akzeptable Toleranz: ≤ 1px Unterschied durch Rundung

## Out of scope

- Kein Refactoring der Komponenten-Logik
- Kein Ändern von Funktionalität
- Keine Änderungen an `src/lib/` oder `src/stores/`

## Links

- `src/components/` — alle 157 Svelte-Komponenten
- FEAT-0337 — Design Token Foundation (Voraussetzung)
- FEAT-0338 — Core Utility Upgrade (Voraussetzung)
- FEAT-0339 — Shared Component Classes (optional)