#!/usr/bin/env bash
set -uo pipefail

# Retires a finished git worktree: removes the directory, untracks it from
# Gortex, and deletes the merged branch. Counterpart to
# scripts/index-worktree.sh, which registers a worktree at session start.
#
# Both halves matter. `git worktree remove` untracks nothing and
# `gortex untrack` removes no directory, so doing only one leaves a stale
# half behind. Every tracked worktree is a full repo in the graph (~31k nodes
# here); five stale copies were enough to push `explore` past its deadline.
#
# The default is to retire ONE named worktree — the one you just finished, as
# "Agent Lifecycle" in AGENTS.md prescribes. Sweeping up other agents'
# worktrees is deliberately opt-in (--all), because a merged, clean worktree
# still looks disposable while somebody is working in it.
#
# Safeguards (all modes):
#   - never passes --force, so git refuses any worktree with uncommitted work
#   - never touches the main checkout or the worktree it runs from
#   - refuses a branch that is not merged into origin/develop
#   - skips worktrees with a live agent session where it can detect one
#   - --all reports only, until --apply is added
#
# Usage:
#   bash scripts/worktree-cleanup.sh <branch|path>   # retire one (normal case)
#   bash scripts/worktree-cleanup.sh --all           # report retirable ones
#   bash scripts/worktree-cleanup.sh --all --apply   # retire them

BASE="origin/develop"

MAIN="$(git worktree list --porcelain | awk '/^worktree /{print $2; exit}')" || exit 1
[ -n "$MAIN" ] || { echo "not inside a git repository"; exit 1; }
CURRENT="$(git rev-parse --show-toplevel 2>/dev/null)"

git fetch origin develop --quiet 2>/dev/null || \
    echo "warning: could not fetch $BASE — merge detection may be stale"

# Worktrees an agent is sitting in right now. The Gortex daemon knows each
# connected client's cwd, which is the only signal available here — but it is
# not complete: a client configured with a parent directory as its cwd (the
# usual fix for multi-repo setups) reports that parent, not the worktree it is
# editing. Treat a hit as authoritative and a miss as "unknown", never as
# "definitely idle". The clean/merged checks carry the real weight.
ACTIVE_CWDS=""
if command -v gortex >/dev/null 2>&1; then
    ACTIVE_CWDS="$(gortex daemon status 2>/dev/null |
        awk '/MCP sessions/{s=1} s' |
        grep -oE '/[^ │|]+' | sort -u)"
fi

has_active_session() {
    [ -n "$ACTIVE_CWDS" ] || return 1
    printf '%s\n' "$ACTIVE_CWDS" | grep -qxF "$1"
}

resolve_path() {  # accepts a branch name or a path, prints the worktree path
    local want="$1" path="" branch=""
    while IFS= read -r line; do
        case "$line" in
            worktree\ *) path="${line#worktree }" ;;
            branch\ *)
                branch="${line#branch refs/heads/}"
                if [ "$branch" = "$want" ] || [ "$path" = "${want%/}" ]; then
                    printf '%s\n' "$path"
                    return 0
                fi
                ;;
        esac
    done < <(git worktree list --porcelain)
    return 1
}

branch_of() {
    git -C "$1" rev-parse --abbrev-ref HEAD 2>/dev/null
}

# Returns 0 when the worktree may be retired; otherwise prints why.
check() {
    local path="$1" branch="$2"
    if [ "$path" = "$MAIN" ]; then echo "main checkout"; return 1; fi
    if [ "$path" = "$CURRENT" ]; then echo "current worktree"; return 1; fi
    if [ -n "$(git -C "$path" status --porcelain 2>/dev/null)" ]; then
        echo "uncommitted changes"; return 1
    fi
    if has_active_session "$path"; then echo "agent session active"; return 1; fi
    if ! git merge-base --is-ancestor "$branch" "$BASE" 2>/dev/null; then
        echo "not merged into $BASE"; return 1
    fi
    return 0
}

retire() {
    local path="$1" branch="$2"
    if git worktree remove "$path" 2>/dev/null; then
        command -v gortex >/dev/null 2>&1 &&
            { gortex untrack "$path" >/dev/null 2>&1 ||
              echo "  note: gortex untrack failed (daemon down?) — rerun later"; }
        git branch -d "$branch" >/dev/null 2>&1
        echo "retired  $branch"
        return 0
    fi
    echo "failed   $branch — git refused removal"
    return 1
}

if [ "${1:-}" != "--all" ]; then
    target="${1:-}"
    [ -n "$target" ] || {
        echo "usage: worktree-cleanup.sh <branch|path> | --all [--apply]" >&2
        exit 1
    }
    path="$(resolve_path "$target")" || {
        echo "no worktree matches '$target'" >&2
        exit 1
    }
    branch="$(branch_of "$path")"
    if reason="$(check "$path" "$branch")"; then
        retire "$path" "$branch" || exit 1
    else
        echo "refused  $branch — $reason" >&2
        exit 1
    fi
    git worktree prune 2>/dev/null
    exit 0
fi

APPLY=0
[ "${2:-}" = "--apply" ] && APPLY=1
n=0 kept=0

while IFS= read -r line; do
    case "$line" in
        worktree\ *) path="${line#worktree }" ;;
        branch\ *)
            branch="${line#branch refs/heads/}"
            [ "$path" = "$MAIN" ] && continue
            if reason="$(check "$path" "$branch")"; then
                if [ "$APPLY" -eq 1 ]; then retire "$path" "$branch"
                else echo "would retire  $branch"; fi
                n=$((n + 1))
            else
                echo "keep     $branch — $reason"
                kept=$((kept + 1))
            fi
            ;;
    esac
done < <(git worktree list --porcelain)

git worktree prune 2>/dev/null
echo
[ "$APPLY" -eq 1 ] && echo "$n retired, $kept kept" ||
    echo "$n retirable, $kept kept — rerun with --apply"
