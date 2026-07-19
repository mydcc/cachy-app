# CLAUDE.md

Cachy — Local-First-Webapp für Krypto-Trader (Positionsgrößen-Rechner, Risikomanagement, Trade-Journal, Echtzeit-Marktdaten via Bitunix/Bitget). Der Code fließt in eine Trading-Engine mit echtem Geld: Präzision und Verifikation gehen vor Geschwindigkeit.

## Sprache

- **Antworten an den User: Deutsch.**
- Code, Variablen, Kommentare, Commits: Englisch.

## Befehle

```bash
npm run dev          # Dev-Server (baut zuerst WASM via scripts/build_wasm.sh)
npm run build        # Produktions-Build (inkl. WASM)
npm run check        # svelte-check (Typprüfung) — nach jeder Änderung ausführen
npm test             # Alle Vitest-Unit-Tests
npx vitest run <pfad>  # Einzelne Testdatei, z. B. npx vitest run src/stores/market.test.ts
npm run test:e2e     # Playwright-E2E-Tests (tests/e2e)
```

## Architektur

- **Local-First:** Alle Nutzerdaten (Journal, Settings, API-Keys) liegen ausschließlich im `localStorage`. Keine Server-Persistenz einführen.
- `src/services/` — API- und WebSocket-Services (Bitunix/Bitget), Berechnungslogik. Tests liegen direkt daneben (`*.test.ts`).
- `src/stores/` — Svelte-5-Rune-Stores (`*.svelte.ts`), ebenfalls mit Tests daneben.
- `src/components/` — UI-Komponenten (inputs, layout, results, settings, shared).
- `src/lib/` — Rechner-Kern (`calculator.ts`), Utilities, Types.
- `src/routes/[[lang]]/` — i18n-Routing (Deutsch + Englisch, `src/locales/`). Neue UI-Texte immer in **beiden** Sprachen anlegen.
- `server/` — SpacetimeDB-Modul; hat eine eigene CLAUDE.md mit eigenen Regeln.
- `technicals-wasm/` — WASM-Modul für Indikator-Berechnungen.

## Nicht verhandelbare Regeln

### Svelte 5 Runes only (Legacy-Syntax ist verboten)

| Verboten (Legacy) | Stattdessen |
|---|---|
| `export let x` | `let { x } = $props()` |
| `$: doubled = …` | `$derived(…)` / `$effect(…)` |
| `createEventDispatcher` | Callback-Props (`onclick`) |
| `<slot>` | Snippets `{#snippet …}` |

- State: `let count = $state(0);`
- Jeder `$effect`, der Listener/Subscriptions registriert, **muss** eine Cleanup-Funktion zurückgeben.

### Finanzdaten

- **`decimal.js` für alle Preise, Beträge und Balances.** Natives `number` ist für Finanzwerte verboten (Rundungsfehler = Geldverlust).

### Theming (20+ Themes)

- **Keine hardcodierten Farben** (kein `#ffffff` o. ä.). Nur CSS-Variablen: `var(--bg-primary)`, `var(--text-secondary)`, …
- Für Hintergrund+Text die **Paired-Klassen** aus `src/themes.css` verwenden: `.bg-accent-paired`, `.bg-success-paired`, `.bg-danger-paired`, `.bg-warning-paired`, `.hover-bg-accent-paired`.

### Performance

- Keine schweren Berechnungen (sort/filter/map) direkt im Template `{#each}` — Daten vorher mit `$derived` aufbereiten.

## Arbeitsweise

- **Verifikation statt Behauptung:** Nach jeder Code-Änderung `npm run check` und die betroffenen Tests ausführen (Skill `/verify`). Erst danach als erledigt melden.
- **Defensive Deletion:** Keinen Code löschen, dessen Zweck unklar ist. Copyright-Header und Metadaten unangetastet lassen.
- **Debug-Logs behalten:** `console.log`-Statements nur auf ausdrückliche Anweisung entfernen.
- **Playwright:** Robuste Selektoren (`getByRole`, `getByText`), `expect(locator).toBeVisible()` statt fester Timeouts.

## Commits

Conventional Commits (semantic-release): `feat:` (Minor), `fix:` (Patch), `refactor:` (kein Release), `BREAKING CHANGE:` im Footer für Major.
