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

# Mehrere Backlog-Items parallel anstoßen (Pro-Plan: bis zu 15 gleichzeitig)
for f in docs/backlog/ready-for-jules/*.md; do
  ./scripts/jules/create-session.sh --file "$f"
done

# Production-Check von Hand auslösen (statt auf den täglichen Cron zu warten)
PRODUCTION_URL=https://cachy.app ./scripts/jules/monitor-production.sh
```

## Backlog automatisch abarbeiten

`dispatch-backlog.mjs` folgt exakt der Definition aus `docs/backlog/README.md`:
`status: ready` heißt dort bereits "an agent or a developer could start now".
Der Dispatcher nimmt genau diese Items, keine eigene Interpretation.

**Damit überhaupt etwas passiert, muss zuerst ein Item auf `ready` stehen.**
Aktuell (Stand Einrichtung) hat kein einziges Backlog-Item diesen Status — nur
`idea`/`specced`/`in-progress`/`done`. Ein Item von `specced` auf `ready`
heben heißt: im Front-Matter `status: ready` setzen, `depends_on` sind
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
# Testlauf ohne echte API-Calls
node scripts/jules/dispatch-backlog.mjs --dry-run

# Echt dispatchen (max. 5 pro Lauf, Env JULES_MAX_PER_RUN zum Anpassen)
node scripts/jules/dispatch-backlog.mjs
```

## Sicherheitsgrenzen (wichtig)

- Jules erhält über `sourceContext` nur Lesezugriff auf den Git-Verlauf/Code des angegebenen Branches — **keine** Exchange-API-Keys, **keine** Deploy-Credentials, **keine** `.env`-Secrets. Diese sind ohnehin Klasse-A-Daten und dürfen laut `AGENTS.md`/`CLAUDE.md` nie einen Server oder eine fremde Cloud-VM erreichen.
- Jedes von `monitor-production.sh` ausgelöste Ergebnis ist ein **Vorschlag** (PR gegen `develop`), kein Auto-Merge. Vor dem Mergen gilt weiterhin: `npm run check` + Tests grün, menschlicher Review — besonders bei allem, was Risiko-/Positionsgrößen- oder Signatur-Logik berührt (siehe Scope-Hinweis in `AGENTS.md`).
- Reports landen unter `reports/production-monitor/` (git-ignoriert) bzw. als Workflow-Artifact mit 90 Tagen Aufbewahrung — kein automatischer Commit auf `develop`/`main`.
