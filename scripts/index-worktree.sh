#!/usr/bin/env bash
set -uo pipefail

# Registers the current git worktree with Gortex so graph tools work inside
# any linked worktree (not just the main checkout). jCodeMunch already maps
# worktrees to the indexed root repo, so it needs no action here.
#
# Safe to run anywhere: no-ops on the main worktree or outside a repo.

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
MAIN="$(git worktree list --porcelain | awk '/^worktree /{print $2; exit}')"
CWD_WT="$ROOT"

# On the main worktree there is nothing to register.
[ "$CWD_WT" = "$MAIN" ] && exit 0

# Only act when cwd is actually a known linked worktree.
grep -qx "worktree $CWD_WT" <(git worktree list --porcelain) || exit 0

echo "registering worktree $CWD_WT with Gortex"
gortex call track_repository --arg path="$CWD_WT" --arg as_worktree=true || true
gortex call index_repository --arg path="$CWD_WT"                       || true
