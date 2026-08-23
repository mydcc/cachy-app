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

#
# Fetch origin/develop and rebase the current branch onto it BEFORE running
# checks or pushing. A check on a stale branch is wasted work: sync first,
# resolve conflicts, then verify.
#
# Usage: scripts/sync-develop.sh [<remote>] [<base-branch>]
#        (defaults: origin develop)
#
# Exit codes:
#   0  up to date / ahead-only / rebased cleanly
#   1  rebase stopped with conflicts — resolve them, re-run checks,
#      then push with --force-with-lease
#   2  uncommitted changes present — commit or stash before syncing
#

set -eu

REMOTE="${1:-origin}"
BASE="${2:-develop}"
BASE_REF="$REMOTE/$BASE"

git fetch "$REMOTE" "$BASE"

BEHIND=$(git rev-list --count HEAD.."$BASE_REF")
if [ "$BEHIND" -eq 0 ]; then
    echo "✓ Up to date with $BASE_REF — nothing to do."
    exit 0
fi

if [ -n "$(git status --porcelain)" ]; then
    echo "❌ $BASE_REF moved ($BEHIND commit(s)), but the working tree has uncommitted changes." >&2
    echo "   Commit your work first (or stash), then run this script again." >&2
    exit 2
fi

echo "↻ $BASE_REF advanced by $BEHIND commit(s); rebasing..."
if ! git rebase "$BASE_REF"; then
    echo "" >&2
    echo "❌ Rebase stopped with conflicts." >&2
    echo "   1. Resolve the files listed by 'git status'" >&2
    echo "   2. git rebase --continue" >&2
    echo "   3. Re-run npm run check + the relevant targeted tests" >&2
    echo "   4. git push --force-with-lease" >&2
    exit 1
fi

echo "✓ Rebased onto $BASE_REF ($BEHIND commit(s))."
echo "  Now re-run npm run check + relevant tests, then:"
echo "  git push --force-with-lease"
