#!/bin/bash

# Copyright (C) 2026 MYDCT
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

# Synthetic monitoring for the LIVE deployment (not CI, not localhost).
# Checks the running app at PRODUCTION_URL (default: https://cachy.app):
#   1. /api/health responds
#   2. Security headers present (HSTS, CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy)
#   3. Lighthouse performance/accessibility/best-practices/SEO scores
#
# This script never modifies code. It only reads a public URL and writes a
# report. On a regression it hands the report to a Jules session via
# create-session.sh so a PR gets proposed — Jules never gets deploy or
# exchange credentials, only the report text and read access to the repo.
#
# Usage: PRODUCTION_URL=https://cachy.app ./scripts/jules/monitor-production.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PRODUCTION_URL="${PRODUCTION_URL:-https://cachy.app}"
PERF_THRESHOLD="${PERF_THRESHOLD:-70}"
REPORT_DIR="$REPO_ROOT/reports/production-monitor"
DATE_STAMP=$(date -u +%Y-%m-%d)
REPORT_FILE="$REPORT_DIR/$DATE_STAMP.md"
HISTORY_FILE="$REPORT_DIR/HISTORY.md"

mkdir -p "$REPORT_DIR"
[[ -f "$HISTORY_FILE" ]] || echo "# Production Monitor — Verlauf" > "$HISTORY_FILE"

ISSUES=()

# --- 1. Health check ---
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$PRODUCTION_URL/api/health" || echo "000")
if [[ "$HEALTH_STATUS" != "200" ]]; then
  ISSUES+=("Health-Check: HTTP $HEALTH_STATUS statt 200 ($PRODUCTION_URL/api/health)")
fi

# --- 2. Security headers ---
HEADERS=$(curl -sIL "$PRODUCTION_URL" || echo "")
for h in "Strict-Transport-Security" "Content-Security-Policy" "X-Content-Type-Options" "X-Frame-Options" "Referrer-Policy"; do
  if ! echo "$HEADERS" | grep -qi "^$h:"; then
    ISSUES+=("Fehlender Security-Header: $h")
  fi
done

# --- 3. Lighthouse (falls verfügbar) ---
LH_JSON="$REPORT_DIR/.lighthouse-$DATE_STAMP.json"
PERF_SCORE="n/a"
if command -v npx >/dev/null 2>&1; then
  npx --yes lighthouse "$PRODUCTION_URL" \
    --output=json --output-path="$LH_JSON" \
    --chrome-flags="--headless=new --no-sandbox" \
    --quiet >/dev/null 2>&1 || true

  if [[ -f "$LH_JSON" ]]; then
    PERF_SCORE=$(node -e "
      const r = require('$LH_JSON');
      console.log(Math.round((r.categories.performance?.score ?? 0) * 100));
    " 2>/dev/null || echo "n/a")

    if [[ "$PERF_SCORE" != "n/a" && "$PERF_SCORE" -lt "$PERF_THRESHOLD" ]]; then
      ISSUES+=("Lighthouse Performance-Score $PERF_SCORE liegt unter Schwelle $PERF_THRESHOLD")
    fi
    rm -f "$LH_JSON"
  fi
fi

# --- Report schreiben ---
{
  echo "# Production Monitor — $DATE_STAMP"
  echo ""
  echo "- URL: $PRODUCTION_URL"
  echo "- Health-Check: HTTP $HEALTH_STATUS"
  echo "- Lighthouse Performance: $PERF_SCORE"
  echo "- Gefundene Probleme: ${#ISSUES[@]}"
  echo ""
  if [[ ${#ISSUES[@]} -gt 0 ]]; then
    echo "## Probleme"
    for issue in "${ISSUES[@]}"; do
      echo "- $issue"
    done
  else
    echo "Keine Auffälligkeiten."
  fi
} > "$REPORT_FILE"

echo "$DATE_STAMP | Health=$HEALTH_STATUS | Perf=$PERF_SCORE | Issues=${#ISSUES[@]}" >> "$HISTORY_FILE"

cat "$REPORT_FILE"

# --- Discord (optional, silent no-op ohne Webhook) ---
if [[ -f "$SCRIPT_DIR/../discord-notify.sh" ]]; then
  # shellcheck source=/dev/null
  source "$SCRIPT_DIR/../discord-notify.sh"
  if [[ ${#ISSUES[@]} -gt 0 ]]; then
    send_discord "⚠️ Production Monitor: ${#ISSUES[@]} Auffälligkeit(en)" "$(printf '%s\n' "${ISSUES[@]}")" "$COLOR_WARNING"
  fi
fi

# --- Bei Auffälligkeiten: Jules-Session anstoßen (mit Dedup-Guard) ---
# Der Monitor ist zustandslos (frische CI-VM, reports/ ist ephemer): ohne
# diesen Guard erzeugt jeder Lauf mit derselben Live-Lage eine neue
# Jules-Session mit fast identischem Prompt (13./14./15.10.2026: drei
# Sessions, ein PR). Geprüft wird die Jules-Session-Liste wie in
# dispatch-backlog.mjs — nicht das Dateisystem. Report und Discord oben
# laufen trotzdem; nur der teure Jules-Run wird gedrosselt.
JULES_DEDUP_DAYS="${JULES_DEDUP_DAYS:-7}"
if [[ ${#ISSUES[@]} -gt 0 && -n "${JULES_API_KEY:-}" ]]; then
  ISSUES_FILE="$REPORT_DIR/.issues-$DATE_STAMP.txt"
  printf -- '%s\n' "${ISSUES[@]}" > "$ISSUES_FILE"
  ISSUE_SIGNATURE=$(node "$SCRIPT_DIR/monitor-dedup.mjs" --print-signature --issues-file "$ISSUES_FILE")
  MONITOR_TITLE="Production-Monitor: $ISSUE_SIGNATURE"
  DEDUP_RESULT=$("$SCRIPT_DIR/list-sessions.sh" "${JULES_SESSION_PAGE_SIZE:-100}" 2>/dev/null \
    | node "$SCRIPT_DIR/monitor-dedup.mjs" --title "$MONITOR_TITLE" --issues-file "$ISSUES_FILE" --days "$JULES_DEDUP_DAYS" \
    || echo "ERROR|-|session list unloadable")
  rm -f "$ISSUES_FILE"
  DEDUP_DECISION="${DEDUP_RESULT%%|*}"
  DEDUP_REST="${DEDUP_RESULT#*|}"
  DEDUP_LAST="${DEDUP_REST%%|*}"
  case "$DEDUP_DECISION" in
    SKIP)
      echo "⏭️  Keine neue Jules-Session: Signatur $ISSUE_SIGNATURE bereits bearbeitet ($DEDUP_LAST). Cooldown: $JULES_DEDUP_DAYS Tage."
      ;;
    PROCEED)
      if [[ "$DEDUP_LAST" != "-" ]]; then
        LAST_NOTE="Derselbe Befund (Signatur $ISSUE_SIGNATURE) wurde bereits in $DEDUP_LAST bearbeitet, ohne dass er in Produktion verschwand."
      else
        LAST_NOTE="Zu dieser Signatur ($ISSUE_SIGNATURE) ist keine frühere Bearbeitung bekannt."
      fi
      PROMPT=$(cat <<EOF
Der tägliche Production-Monitor für $PRODUCTION_URL hat ${#ISSUES[@]} Auffälligkeit(en) gefunden:

$(printf -- '- %s\n' "${ISSUES[@]}")

Analysiere die Ursache im Code und schlage einen Fix als PR gegen develop vor.
Halte dich strikt an AGENTS.md: keine Risiko-/Positionsgrößen-Logik und keine
Signatur-/Crypto-Logik ohne expliziten menschlichen Review anfassen. Bei reinen
Security-Header- oder Performance-Themen (z. B. hooks.server.ts, vite.config.ts,
Asset-Größen) darfst du eigenständig einen Fix vorschlagen.

---
$LAST_NOTE
Beachte das Deploy-Mapping, bevor du Code änderst: $PRODUCTION_URL läuft vom
Stable-Zweig (main, siehe deploy.sh), develop geht nach dev.cachy.app. Ein Fix
auf develop erreicht die Produktion erst mit dem nächsten Stable-Release plus
Prod-Deploy. Prüfe außerdem die nginx-Ebene (add_header-Vererbung, siehe
DEPLOYMENT.md): Code-Header aus hooks.server.ts/server.js greifen nicht, wenn
nginx statisch ausliefert.
EOF
)
      "$SCRIPT_DIR/create-session.sh" --title "$MONITOR_TITLE" "$PROMPT"
      ;;
    *)
      echo "⚠️  Session-Liste nicht ladbar ($DEDUP_REST) — keine Jules-Session ohne Dedup-Schutz (Fail-closed wie dispatch-backlog.mjs)."
      ;;
  esac
else
  echo "ℹ️  Keine Jules-Session ausgelöst (keine Probleme oder JULES_API_KEY fehlt)."
fi
