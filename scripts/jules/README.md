# scripts/jules/

Wrappers um die [Jules API](https://developers.google.com/jules/api) sowie das
Live-Monitoring der Produktion. Drei Anwendungsfälle, zwei davon manuell, einer
automatisiert:

| Script | Zweck |
| --- | --- |
| `create-session.sh` | Eine Jules-Session (Task) programmatisch anstoßen — manuell oder aus einem anderen Script heraus. |
| `list-sources.sh` | Zeigt die verbundenen Repos (`sources/...`-IDs) — einmalig zum Ermitteln von `JULES_SOURCE`. |
| `monitor-production.sh` | Prüft die **laufende** Produktion (`cachy.app`), nicht CI/localhost: Health-Check, Security-Header, Lighthouse-Score. Bei Auffälligkeiten wird automatisch eine Jules-Session gestartet. Läuft täglich über `.github/workflows/production-monitor.yml`. |
| `list-sessions.sh` | Zeigt kürzlich erstellte Jules-Sessions — zum manuellen Nachschauen oder für den Dedup-Check in `dispatch-backlog.mjs`. |
| `dispatch-backlog.mjs` | Schickt `docs/backlog/`-Items mit `status: ready` automatisch an Jules, ohne dass du pro Item selbst `create-session.sh` aufrufen musst. Läuft wöchentlich über `.github/workflows/backlog-dispatch.yml`. Siehe Abschnitt „Backlog automatisch abarbeiten" unten. |

> Beispiele unten sind `bash`-Syntax. In `fish` entsprechend `set -x NAME wert`
> statt `export NAME="wert"`, und Befehle nicht mit `\` über mehrere Zeilen
> umbrechen (fish/Terminal-Paste kann das zusammenkleben).

## Einmaliges Setup

1. API-Key erzeugen: [jules.google.com/settings](https://jules.google.com/settings) (max. 3 Keys gleichzeitig). **Niemals committen.**
2. Lokal testen:
   ```bash
   export JULES_API_KEY="..."
   ./scripts/jules/list-sources.sh
   ```
   Liefert die `sources/...`-ID des Cachy-Repos → als `JULES_SOURCE` merken.
3. Für die GitHub Action (`production-monitor.yml`) im Repo unter *Settings → Secrets and variables → Actions*:
   - Secret `JULES_API_KEY`
   - Repository Variable `JULES_SOURCE` = `sources/github/mydcc/cachy-app` (bestätigtes Format, Schrägstriche, nicht Bindestriche)
   - Optional: Repository Variable `PRODUCTION_URL` (Default `https://cachy.app`), Secret `DISCORD_WEBHOOK_URL` für Benachrichtigungen.

## Manuelle Nutzung

```bash
export JULES_API_KEY="..."
export JULES_SOURCE="sources/github/mydcc/cachy-app"

# Einzelne Aufgabe anstoßen
./scripts/jules/create-session.sh "Add unit tests for src/utils/heatmapUtils.ts"

# Ein konkretes Backlog-Item anstoßen — der Weg für alles, was der
# Dispatcher bewusst auslässt (execution/security/exchange, P0).
# Der Titel "<ID>: <Titel>" wird aus dem Front-Matter abgeleitet, damit
# dispatch-backlog.mjs das Item später nicht doppelt startet.
./scripts/jules/create-session.sh --file docs/backlog/bugs/BUG-0053-device-key-loss-orphans-secrets.md

# Freiform-Prompt, der trotzdem einem Item zugeordnet bleiben soll
./scripts/jules/create-session.sh --title "BUG-0053: Kurzfassung" "Nur den Canary-Teil umsetzen"

# Production-Check von Hand auslösen (statt auf den täglichen Cron zu warten)
PRODUCTION_URL=https://cachy.app ./scripts/jules/monitor-production.sh
```

## Backlog automatisch abarbeiten

`dispatch-backlog.mjs` folgt exakt der Definition aus `docs/backlog/README.md`:
`status: ready` heißt dort bereits "an agent or a developer could start now".
Der Dispatcher nimmt genau diese Items, keine eigene Interpretation.

**Damit überhaupt etwas passiert, muss zuerst ein Item auf `ready` stehen.**
Welche das gerade sind, steht in `docs/backlog/INDEX.md` — der Dispatcher
nimmt genau diese. Ein Item von `specced` auf `ready` heben heißt: im Front-Matter `status: ready` setzen, `depends_on` sind
tatsächlich alle `done`, ein `adr: required` hat eine existierende ADR — dann
`npm run backlog:index` laufen lassen und committen. Das bleibt bewusst ein
manueller Schritt: die Einschätzung "ist das wirklich unblockiert" soll ein
Mensch treffen, nicht der Dispatcher.

Sicherheitsfilter zusätzlich zu `status: ready`:
- `area` nicht in `execution`, `security`, `exchange` (Env `JULES_EXCLUDE_AREAS`
  zum Anpassen)
- `priority` nicht `P0`

Diese Items bleiben absichtlich manuell — per `create-session.sh --file
docs/backlog/....md`, wenn du im Einzelfall doch möchtest.

```bash
# Testlauf: erstellt nichts, liest aber die bestehenden Sessions,
# damit er zeigt was ein echter Lauf täte (JULES_API_KEY nötig)
node scripts/jules/dispatch-backlog.mjs --dry-run

# Echt dispatchen (max. 5 pro Lauf, Env JULES_MAX_PER_RUN zum Anpassen)
node scripts/jules/dispatch-backlog.mjs
```

### Dedup — der einzige Schutz gegen doppelte Sessions

Jules setzt zwar `status: in-progress`, aber auf seinem eigenen Branch — auf
`develop` steht das Item bis zum Merge weiterhin auf `ready`. Der Status
schützt dich also **nicht**; nur der Abgleich mit den bestehenden Sessions tut
das. Deshalb bricht der Lauf ab, wenn die Session-Liste nicht ladbar ist,
statt ungeschützt zu dispatchen.

Geprüft werden die letzten 100 Sessions (`JULES_SESSION_PAGE_SIZE`), sofern sie
nicht älter als 30 Tage sind (`JULES_SESSION_MAX_AGE_DAYS`). Das Zeitfenster
sorgt dafür, dass ein Item, das du nach einem gescheiterten Versuch wieder auf
`ready` setzt, erneut drankommt, statt dauerhaft von einer alten Session
blockiert zu werden.

Gelesen werden nur `title` und `prompt` einer Session — nicht Outputs, PR-Links
oder Branch-Namen. Eine ID, die dort auftaucht, ist ein Nebenprodukt der Arbeit,
kein Anspruch auf das Item. Innerhalb dieser beiden Felder wird unterschieden:

| Fall | Erkannt an | Meldung |
| --- | --- | --- |
| Session **bearbeitet** das Item | `BUG-0001: …` im Titel, `Backlog-Item BUG-0001` im Prompt, oder `id: BUG-0001` im Front-Matter (bei `create-session.sh --file`) | `Session bearbeitet dieses Item bereits` |
| Session **erwähnt** das Item nur | ID steht irgendwo sonst im Prompt — z. B. weil ein per `--file` gesendetes Backlog-Item in seinem `Links`-Abschnitt auf andere IDs verweist | `nur in einer fremden Session erwähnt` |

Beide Fälle überspringen das Item. Das ist Absicht: ein zu viel übersprungenes
Item kostet eine Woche Verzögerung und bleibt `ready`, zwei Agenten auf einem
Item kosten zwei widersprüchliche PRs. Der Unterschied steckt in der Meldung,
damit eine unerwartete Unterdrückung sichtbar ist statt still. Wenn ein Item
fälschlich als „nur erwähnt" übersprungen wird, starte es von Hand per
`create-session.sh --file docs/backlog/…`.

> **Freiform-Prompts umgehen den Dedup.** `create-session.sh "Fix das Ding in
> IndicatorSettings"` nennt keine ID und wird deshalb nicht als Bearbeitung
> erkannt. Für Backlog-Arbeit immer `--file` mit der Item-Datei nutzen (setzt
> den Titel automatisch) oder `--title "<ID>: …"` mitgeben. Nennt ein
> Freiform-Prompt eine Item-ID ohne Titel, warnt `create-session.sh` davor.

### Automatische PR-Veröffentlichung

Beide Wege — Dispatcher und `create-session.sh` — setzen standardmäßig
`automationMode: AUTO_CREATE_PR`. Ohne dieses Feld beendet Jules die Arbeit,
aber der PR existiert erst, nachdem jemand die Session in der Jules-UI öffnet
und manuell auf „Publish" klickt — bei automatisiertem Dispatch (wöchentlicher
Cron) ist das der Bruch, der die Automatisierung nutzlos macht.

Zum Abschalten (z. B. um den Diff zu sehen, bevor er zum PR wird):
- Dispatcher: `JULES_AUTOMATION_MODE=` (leer) als Env-Var
- `create-session.sh`: `--no-auto-pr` oder ebenfalls `JULES_AUTOMATION_MODE=`

`requirePlanApproval` bleibt unangetastet — API-Sessions haben Pläne laut
Jules-Doku bereits standardmäßig auto-approved; das war nie der blockierende
Schritt.

## Wiederkehrende Agenten-Prompts (`prompts/`)

Vier spezialisierte Prompts für wiederkehrende Jules-Tasks, die **in der
Jules-UI** als eigene Scheduled Tasks eingerichtet werden (nicht über eines
der Scripts hier — die UI kennt kein Aufrufen einer Datei als Prompt). Die
Dateien in `prompts/` sind die versionierte Quelle der Wahrheit; bei einer
Änderung den Inhalt hier committen und anschließend den Prompt-Text im
jeweiligen Jules-Task in der UI aktualisieren.

| Prompt | Rolle | Kadenz | Schreibzugriff |
| --- | --- | --- | --- |
| `prompts/bolt.md` | Performance — eine gemessene Optimierung pro Lauf | täglich | Produktionscode, PR gegen `develop` |
| `prompts/palette.md` | UX & Accessibility — ein Micro-Fix pro Lauf | täglich | Produktionscode, PR gegen `develop` |
| `prompts/sentinel.md` | Security — ein Fix im autonomen Rahmen pro Lauf | täglich | Produktionscode, PR gegen `develop` |
| `prompts/ledger.md` | Korrektheits-Audit — ein Subsystem pro Lauf, reiner Auditor | wöchentlich (freitags, vor dem montäglichen Backlog-Dispatch) | nur `docs/backlog/**` + eigenes Journal, kein Produktionscode |

Alle vier zeigen auf `AGENTS.md` als einzige Regelquelle (Svelte-5-Runes,
`decimal.js`, Local-First-Grenze, Branch-Workflow) und duplizieren sie
bewusst nicht — Regeländerungen an einer Stelle pflegen, nicht an fünfen.
Jeder Prompt führt vor dem Start ein eigenes Journal unter `.jules/<name>.md`
(nur kritische, wiederverwendbare Erkenntnisse, kein Aktivitätslog) und
respektiert dieselbe Sperrzone für autonome Agenten wie
`dispatch-backlog.mjs`: Risiko-/Positionsgrößen-Mathematik, Signatur-/
Krypto-Logik und alles, was `decimal.js`-Präzision oder die
Local-First-Grenze berührt, wird nicht autonom gemergt.

`ledger.md` ist bewusst der einzige reine Auditor: Er ändert nie Code unter
`src/`, `server/` oder `technicals-wasm/`, sondern legt Findings als
Backlog-Items (`status: specced`, nie `ready`) an — die landen erst nach
menschlichem Grooming im wöchentlichen `backlog-dispatch.yml`-Lauf. So bleibt
die Entscheidung „ist das wirklich unblockiert" beim Menschen, wie im
Abschnitt „Backlog automatisch abarbeiten" oben.

## Sicherheitsgrenzen (wichtig)

- Jules erhält über `sourceContext` nur Lesezugriff auf den Git-Verlauf/Code des angegebenen Branches — **keine** Exchange-API-Keys, **keine** Deploy-Credentials, **keine** `.env`-Secrets. Diese sind ohnehin Klasse-A-Daten und dürfen laut `AGENTS.md`/`CLAUDE.md` nie einen Server oder eine fremde Cloud-VM erreichen.
- Jedes von `monitor-production.sh` ausgelöste Ergebnis ist ein **Vorschlag** (PR gegen `develop`), kein Auto-Merge. Vor dem Mergen gilt weiterhin: `npm run check` + Tests grün, menschlicher Review — besonders bei allem, was Risiko-/Positionsgrößen- oder Signatur-Logik berührt (siehe Scope-Hinweis in `AGENTS.md`).
- Reports landen unter `reports/production-monitor/` (git-ignoriert) bzw. als Workflow-Artifact mit 90 Tagen Aufbewahrung — kein automatischer Commit auf `develop`/`main`.
