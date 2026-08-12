# AGENTS.md

Cachy — Local-First-Webapp für Krypto-Trader (Positionsgrößen-Rechner, Risikomanagement, Trade-Journal, Echtzeit-Marktdaten via Bitunix/Bitget). Der Code fließt in eine Trading-Engine mit echtem Geld: Präzision und Verifikation gehen vor Geschwindigkeit.

Diese Datei ist die tool-agnostische Quelle der Wahrheit für alle Coding-Agenten (Jules, Codex, Cursor, Antigravity, ...). Claude Code liest zusätzlich `CLAUDE.md` (Claude-spezifisch, verweist hierher).

## Setup

```bash
npm install
npm run dev          # baut zuerst WASM via scripts/build_wasm.sh
npm run build         # Produktions-Build (inkl. WASM)
npm run check          # svelte-check — nach JEDER Änderung ausführen
npm test               # Vitest Unit-Tests
npm run test:e2e       # Playwright E2E
```

Der Dev-/Build-Prozess hängt vom WASM-Modul in `technicals-wasm/` ab (`scripts/build_wasm.sh`). Ohne diesen Schritt schlägt der Build fehl — bei Cloud-Sandbox-Umgebungen (z. B. Jules Environment Setup) muss dieses Skript Teil des Setup-Schritts sein.

## Nicht verhandelbare Regeln

**Local-First-Datenklassen** (siehe `docs/adr/0001-local-first-boundary.md`):
- Klasse A (Journal, Settings, API-Keys, Presets, private Notizen) verlässt das Gerät **nie** — nur `localStorage`. Niemals an einen Server senden, auch nicht als Telemetrie/Debug-Log.
- Klasse B (aktuell nur Global-Chat via SpacetimeDB) nur opt-in, authentifiziert, minimal, nicht essenziell.
- Klasse C (öffentliche Marktdaten) darf überall liegen, aber nie neben einer Nutzer-Identität.
- Core-Code (Rechner, Risiko-Engine, Journal, Presets, Exchange-Anbindung) importiert **niemals** aus `src/lib/spacetimedb/` oder `src/services/cloudService.ts`.

**Svelte 5 Runes only** — Legacy-Syntax ist verboten:
- `export let x` → `let { x } = $props()`
- `$: doubled = …` → `$derived(…)` / `$effect(…)`
- `createEventDispatcher` → Callback-Props (`onclick`)
- `<slot>` → Snippets `{#snippet …}`
- Jeder `$effect`, der Listener/Subscriptions registriert, MUSS eine Cleanup-Funktion zurückgeben.

**Finanzdaten:** `decimal.js` für ALLE Preise, Beträge, Balances. Natives `number` ist für Finanzwerte verboten.

**Theming:** Keine hardcodierten Farben (`#ffffff` etc.). Nur CSS-Variablen (`var(--bg-primary)`, ...) bzw. Paired-Klassen aus `src/themes.css` (`.bg-accent-paired`, `.bg-success-paired`, `.bg-danger-paired`, `.bg-warning-paired`, `.hover-bg-accent-paired`).

**Performance:** Keine schweren Berechnungen (sort/filter/map) direkt im Template `{#each}` — vorher mit `$derived` aufbereiten.

## Verifikation vor Fertigmeldung

Nach jeder Änderung: `npm run check` und die betroffenen Tests ausführen. Eine Aufgabe gilt erst als erledigt, wenn Typprüfung und Tests grün sind — nicht vorher behaupten.

## Commits & Branches

- [Conventional Commits](https://www.conventionalcommits.org/) (`feat`, `fix`, `refactor`, `BREAKING CHANGE:` im Footer).
- **Niemals direkt auf `develop` oder `main` pushen.** Jede Änderung läuft über einen Feature-Branch und einen Pull Request, Ziel-Branch ist immer `develop`.
- Keinen Code löschen, dessen Zweck unklar ist. Copyright-Header und Metadaten unangetastet lassen. `console.log`-Debug-Statements nur auf ausdrückliche Anweisung entfernen.

## Backlog-Items: vorbereiten, nicht selbst lösen

`docs/backlog/` ist die einzige Quelle für anstehende Arbeit. Ein interaktiver
Coding-Agent (Antigravity, Cursor, Codex, Claude Code, ...), der einen
Backlog-Eintrag antrifft, **implementiert ihn nicht selbst**. Der Ablauf ist:

1. Fehlende Teile ergänzen — Acceptance Criteria, Out of Scope, offene Fragen
   im Fix-Vorschlag klären (siehe `docs/backlog/README.md`) — und `status`
   auf `ready` setzen, sobald das Item vollständig ist.
2. Die eigentliche Umsetzung übernimmt Jules, ausgelöst durch
   `.github/workflows/backlog-dispatch.yml` (`scripts/jules/dispatch-backlog.mjs`,
   wöchentlich oder manuell per Workflow-Dispatch).
3. **Ausnahme, die *nie* automatisch dispatcht wird:** `area: execution`,
   `area: security`, `area: exchange` oder `priority: P0` — diese bleiben
   im Dispatch-Skript bewusst ausgeschlossen und müssen manuell per
   `scripts/jules/create-session.sh --file ...` an Jules übergeben werden,
   nachdem ein Mensch das Item geprüft hat. Auch hier gilt: vorbereiten, nicht
   selbst implementieren.

Ein Agent darf einen Backlog-Bug lesen, ergänzen, mit dem User diskutieren
(vgl. `/backlog-groom`-Workflow) und auf `ready` setzen — aber keinen PR mit
der eigentlichen Fix-Implementierung dafür öffnen, außer der User weist ihn
im konkreten Fall ausdrücklich dazu an.

## Scope-Hinweis für autonome/asynchrone Agenten (z. B. Jules)

Gut geeignet für autonome Cloud-Sessions: Tests schreiben, i18n-Parität (DE/EN) prüfen, Doku/Backlog pflegen, isolierte Refactorings ohne Verhaltensänderung, Dependency-Updates, Accessibility-Fixes.

NICHT autonom ohne besonders sorgfältigen Review mergen: Positionsgrößen-/Risiko-Berechnungen, Signatur-/Krypto-Logik für Exchange-Requests, alles was `decimal.js`-Präzision oder die Local-First-Grenze berührt. Solche PRs immer von einem menschlichen Review + `npm run check` + Tests bestätigen lassen, bevor sie nach `develop` gehen.

Weiterführende Doku: `docs/README.md` (Karte), `docs/adr/` (verbindliche Entscheidungen), `docs/backlog/INDEX.md` (offene Aufgaben).
