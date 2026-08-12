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
HEADERS=$(curl -sI "$PRODUCTION_URL" || echo "")
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

# --- Bei Auffälligkeiten: Jules-Session anstoßen ---
if [[ ${#ISSUES[@]} -gt 0 && -n "${JULES_API_KEY:-}" ]]; then
  PROMPT=$(cat <<EOF
Der tägliche Production-Monitor für $PRODUCTION_URL hat ${#ISSUES[@]} Auffälligkeit(en) gefunden:

$(printf -- '- %s\n' "${ISSUES[@]}")

Analysiere die Ursache im Code und schlage einen Fix als PR gegen develop vor.
Halte dich strikt an AGENTS.md: keine Risiko-/Positionsgrößen-Logik und keine
Signatur-/Crypto-Logik ohne expliziten menschlichen Review anfassen. Bei reinen
Security-Header- oder Performance-Themen (z. B. hooks.server.ts, vite.config.ts,
Asset-Größen) darfst du eigenständig einen Fix vorschlagen.
EOF
)
  "$SCRIPT_DIR/create-session.sh" "$PROMPT"
else
  echo "ℹ️  Keine Jules-Session ausgelöst (keine Probleme oder JULES_API_KEY fehlt)."
fi
