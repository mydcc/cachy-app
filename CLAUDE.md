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

- **Local-First (Datenklassen-Grenze, siehe `docs/adr/0001-local-first-boundary.md`):**
  - **Klasse A — verlässt das Gerät nie:** Journal, Settings, API-Keys/Secrets, Presets, private Notizen, Trade-Entwürfe. Ausschließlich `localStorage`. Niemals an einen Cachy-Server senden — auch nicht als Telemetrie, Crash-Report oder Debug-Log. (Ausnahme: API-Keys als Credential eines nutzerinitiierten Exchange-Requests über den Proxy.)
  - **Klasse B — darf serverseitig liegen:** derzeit nur Global-Chat-Nachrichten (SpacetimeDB, `server/spacetimedb/`). Nur unter allen vier Bedingungen: Opt-in und standardmäßig aus, authentifiziert (kein anonymer Zugriff), minimal (keine Klasse-A-Daten, auch nicht als Metadaten), und nicht essenziell (Rechner, Journal, Risikomanagement funktionieren vollständig ohne Server).
  - **Klasse C — öffentliche Marktdaten und daraus abgeleitete Analysen** (Preise, Klines, News, Sentiment): darf überall liegen, aber **nie neben einer Nutzer-Identität**. Welche Symbole jemand beobachtet, ist Nutzerdatum. Siehe `docs/adr/0004-spacetimedb-data-scope.md`.
  - Jedes **neue** Klasse-B-Feature braucht eine eigene ADR. Ein Feld von Klasse A nach B zu verschieben ist ein `BREAKING CHANGE:`.
  - Local-First **nicht** als Absolutaussage formulieren („keine Server-Persistenz") — das war falsch und hat die Doku vom Code entkoppelt.
  - **Der Core läuft ohne Server** (`docs/adr/0003-edition-boundary.md`): Core-Code — Rechner, Risiko-Engine, Journal, Presets, Notizen, Settings, Exchange-Anbindung, Indikatoren und deren UI — importiert **niemals** aus `src/lib/spacetimedb/` oder `src/services/cloudService.ts`. Nicht hinter einem Flag, nicht in einem try/catch. Server-gestützte Features sind Module hinter einer Schnittstelle.
- `src/services/` — API- und WebSocket-Services (Bitunix/Bitget), Berechnungslogik. Tests liegen direkt daneben (`*.test.ts`).
- `src/stores/` — Svelte-5-Rune-Stores (`*.svelte.ts`), ebenfalls mit Tests daneben.
- `src/components/` — UI-Komponenten (inputs, layout, results, settings, shared).
- `src/lib/` — Rechner-Kern (`calculator.ts`), Utilities, Types.
- `src/routes/[[lang]]/` — i18n-Routing (Deutsch + Englisch, `src/locales/`). Neue UI-Texte immer in **beiden** Sprachen anlegen.
- `server/` — SpacetimeDB-Modul; hat eine eigene CLAUDE.md mit eigenen Regeln.
- `technicals-wasm/` — WASM-Modul für Indikator-Berechnungen.

## Planung & Dokumentation

`docs/README.md` ist die Karte — dort steht, welches Dokument wofür zuständig ist. Kurzfassung:

| Frage | Dokument |
|---|---|
| Warum gibt es Cachy? | `docs/VISION.md` |
| Wo liegt welcher Code? | `docs/ARCHITECTURE.md` |
| Was wird wann gebaut? | `docs/MILESTONES.md` → `docs/ROADMAP.md` |
| Woran arbeite ich konkret? | `docs/backlog/INDEX.md` |
| Was darf ich nicht ändern? | `docs/adr/` |
| Was wartet auf eine Entscheidung des Users? | `docs/TODO.md` |

- **Verlinken, nie duplizieren.** Ein Fakt lebt in genau einer Datei. Zwei Kopien einer Begründung sind der Grund, warum Doku aufhört zu stimmen (siehe `docs/REPO-AUDIT.md`).
- Neue Aufgabe → Backlog-Eintrag aus `docs/backlog/templates/` anlegen, danach `npm run backlog:index`. Das Front-Matter wird validiert; `npm run backlog:check` schlägt fehl, wenn der Index veraltet ist.
- Neue Entscheidung, die künftige Arbeit einschränkt → ADR (`docs/adr/template.md`), nicht ein Absatz irgendwo.

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

## Branch-Workflow

- **Niemals direkt auf `develop` oder `main` pushen.** Jede Änderung läuft über einen Feature-Branch und einen Pull Request.
- Der Conventional-Commits-Check (`commit-lint.yml`) läuft nur auf `pull_request`-Events — direktes Pushen auf `develop` umgeht ihn. PRs sind die einzige Möglichkeit, den Check vor dem Merge zu erzwingen.
- Target-Branch für PRs ist immer **`develop`**, nie `main`.
