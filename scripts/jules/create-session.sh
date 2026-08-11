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
#   ./scripts/jules/create-session.sh --file docs/backlog/bugs/BUG-0001-....md
#   ./scripts/jules/create-session.sh --branch develop "Fix flaky e2e selector in ..."
#   ./scripts/jules/create-session.sh --title "BUG-0001: short summary" "free-form prompt"
#   ./scripts/jules/create-session.sh --no-auto-pr --file docs/backlog/bugs/BUG-0053-....md
#
# Titles matter beyond cosmetics: dispatch-backlog.mjs skips a backlog item that
# an existing session already covers, and it recognises that from the session's
# title and prompt. A --file pointing at a backlog item gets its
# "<ID>: <title>" title derived automatically, so the dispatcher will not
# re-dispatch the same item later. A free-form prompt naming an item but no
# title is warned about below.
#
# By default the session publishes its own PR once the work is done
# (automationMode: AUTO_CREATE_PR) — without it, Jules finishes the change and
# waits in the Jules UI for a human to click "Publish" before a PR exists at
# all. --no-auto-pr (or JULES_AUTOMATION_MODE=) restores that manual-publish
# behaviour, for a case where you want to see the diff before it becomes a PR.
#
# Fails loudly (not silently) if JULES_API_KEY / JULES_SOURCE are missing —
# unlike discord-notify.sh, an unconfigured Jules call is a mistake, not an
# optional feature.

set -euo pipefail

JULES_API_URL="https://jules.googleapis.com/v1alpha/sessions"
STARTING_BRANCH="develop"
PROMPT=""
TITLE=""
AUTOMATION_MODE="${JULES_AUTOMATION_MODE-AUTO_CREATE_PR}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)
      STARTING_BRANCH="$2"
      shift 2
      ;;
    --title)
      TITLE="$2"
      shift 2
      ;;
    --file)
      PROMPT="$(cat "$2")"
      shift 2
      ;;
    --no-auto-pr)
      AUTOMATION_MODE=""
      shift
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

# Derive "<ID>: <title>" from a backlog item's front matter — the same shape
# dispatch-backlog.mjs writes, so its de-dup recognises this session as covering
# that item. Prints nothing for a prompt that is not a backlog item.
if [[ -z "$TITLE" ]]; then
  TITLE=$(node -e '
    const text = process.argv[1] ?? "";
    if (!text.startsWith("---\n")) process.exit(0);
    const end = text.indexOf("\n---", 4);
    if (end === -1) process.exit(0);
    const fm = {};
    for (const line of text.slice(4, end).split("\n")) {
      const i = line.indexOf(":");
      if (i === -1) continue;
      fm[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    if (!/^(?:FEAT|BUG|IDEA)-\d{4}$/.test(fm.id ?? "")) process.exit(0);
    process.stdout.write(`${fm.id}: ${fm.title ?? ""}`.trim().slice(0, 200));
  ' -- "$PROMPT")
fi

# A free-form prompt that names an item but carries no title is invisible to the
# dispatcher's de-dup, which is how the same item ends up with two agents on it.
if [[ -z "$TITLE" ]] && grep -qE '(FEAT|BUG|IDEA)-[0-9]{4}' <<<"$PROMPT"; then
  echo "⚠️  Der Prompt nennt ein Backlog-Item, aber es ist kein Titel gesetzt." >&2
  echo "   dispatch-backlog.mjs erkennt diese Session dann nicht als Bearbeitung" >&2
  echo "   und könnte dasselbe Item erneut dispatchen." >&2
  echo "   Besser: --file docs/backlog/... oder --title \"BUG-0000: Kurzfassung\"" >&2
fi

PAYLOAD=$(node -e '
  const [prompt, source, branch, title, automationMode] = process.argv.slice(1);
  const body = {
    prompt,
    sourceContext: {
      source,
      githubRepoContext: { startingBranch: branch }
    }
  };
  if (title) body.title = title;
  if (automationMode) body.automationMode = automationMode;
  process.stdout.write(JSON.stringify(body));
' -- "$PROMPT" "$JULES_SOURCE" "$STARTING_BRANCH" "$TITLE" "$AUTOMATION_MODE")

if [[ -n "$TITLE" ]]; then
  echo "🏷️  Titel: $TITLE"
fi
if [[ -n "$AUTOMATION_MODE" ]]; then
  echo "🤖 automationMode: $AUTOMATION_MODE (PR wird nach Abschluss automatisch veröffentlicht)"
else
  echo "✋ Kein automationMode gesetzt — PR muss in der Jules-UI manuell freigegeben werden."
fi

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
