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

# Jules API — create a session (task) programmatically.
#
# Requires:
#   JULES_API_KEY   - from https://jules.google.com/settings (never commit this)
#   JULES_SOURCE     - "sources/github/mydcc/cachy-app" (confirmed via list-sources.sh;
#                       note the format is slash-separated, not hyphen-separated)
#
# Usage:
#   ./scripts/jules/create-session.sh "Add unit tests for src/utils/heatmapUtils.ts"
#   ./scripts/jules/create-session.sh --file scripts/jules/prompts/some-task.md
#   ./scripts/jules/create-session.sh --branch develop "Fix flaky e2e selector in ..."
#
# Fails loudly (not silently) if JULES_API_KEY / JULES_SOURCE are missing —
# unlike discord-notify.sh, an unconfigured Jules call is a mistake, not an
# optional feature.

set -euo pipefail

JULES_API_URL="https://jules.googleapis.com/v1alpha/sessions"
STARTING_BRANCH="develop"
PROMPT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)
      STARTING_BRANCH="$2"
      shift 2
      ;;
    --file)
      PROMPT="$(cat "$2")"
      shift 2
      ;;
    *)
      PROMPT="$1"
      shift
      ;;
  esac
done

if [[ -z "${JULES_API_KEY:-}" ]]; then
  echo "❌ JULES_API_KEY ist nicht gesetzt. Key erzeugen unter https://jules.google.com/settings" >&2
  exit 1
fi

if [[ -z "${JULES_SOURCE:-}" ]]; then
  echo "❌ JULES_SOURCE ist nicht gesetzt (z. B. sources/github-mydcc-cachy-app)." >&2
  echo "   Zum Auflisten: ./scripts/jules/list-sources.sh" >&2
  exit 1
fi

if [[ -z "$PROMPT" ]]; then
  echo "❌ Kein Prompt übergeben. Usage: $0 [--branch <branch>] \"<prompt>\" | --file <path>" >&2
  exit 1
fi

PAYLOAD=$(node -e '
  const [prompt, source, branch] = process.argv.slice(1);
  process.stdout.write(JSON.stringify({
    prompt,
    sourceContext: {
      source,
      githubRepoContext: { startingBranch: branch }
    }
  }));
' "$PROMPT" "$JULES_SOURCE" "$STARTING_BRANCH")

echo "🚀 Starte Jules-Session (Branch: $STARTING_BRANCH)..."

RESPONSE=$(curl -sS -X POST \
  -H "X-Goog-Api-Key: $JULES_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  "$JULES_API_URL")

echo "$RESPONSE"

SESSION_NAME=$(echo "$RESPONSE" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{console.log(JSON.parse(d).name||"")}catch{console.log("")}})')

if [[ -n "$SESSION_NAME" ]]; then
  echo "✅ Session erstellt: $SESSION_NAME"
else
  echo "⚠️  Keine Session-ID in der Antwort gefunden — Response oben prüfen." >&2
fi
