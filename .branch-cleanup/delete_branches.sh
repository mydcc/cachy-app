#!/usr/bin/env bash
# Deletes all branches listed in branches_to_delete.txt from origin.
# Run this locally / anywhere with real push access to mydcc/cachy-app.
set -euo pipefail
cd "$(dirname "$0")/.."
while IFS= read -r branch; do
  [ -z "$branch" ] && continue
  echo "Deleting: $branch"
  git push origin --delete "$branch" || echo "  FAILED: $branch"
done < .branch-cleanup/branches_to_delete.txt
