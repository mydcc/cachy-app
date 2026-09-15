#!/usr/bin/env bash
set -uo pipefail

# Retires a finished git worktree: removes the directory and deletes the
# merged branch.
#
# No Gortex tracking call is involved: the daemon discovers linked worktrees
# from `git worktree list` and serves them as layers over the family's primary
# graph. A worktree only becomes a separate full graph if someone explicitly
# tracks it, which AGENTS.md forbids.
#
# The default is to retire ONE named worktree — the one you just finished, as
# "Agent Lifecycle" in AGENTS.md prescribes. Sweeping up other agents'
# worktrees is deliberately opt-in (--all), because a merged, clean worktree
# still looks disposable while somebody is working in it.
#
# Safeguards (all modes):
#   - never passes --force to worktree removal, so git refuses any worktree
#     with uncommitted work
#   - never touches the main checkout or the worktree it runs from
#   - refuses a branch that is neither merged into origin/develop nor
#     squash-merged via a GitHub PR (see is_pr_merged)
#   - refuses a branch that was never worked on (see is_unworked), unless
#     --abandon names it explicitly
#   - skips worktrees with a live agent session where it can detect one
#   - --all reports only, until --apply is added
#
# Usage:
#   bash scripts/worktree-cleanup.sh <branch|path>   # retire one (normal case)
#   bash scripts/worktree-cleanup.sh --all           # report retirable ones
#   bash scripts/worktree-cleanup.sh --all --apply   # retire them
#   bash scripts/worktree-cleanup.sh --abandon <branch|path>
#                                    # retire one that never got a commit
#
# After successful retirements the script re-fetches origin/develop, so the
# next task branch starts current without a manual fetch.

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

# True when GitHub reports a MERGED pull request whose head commit is exactly
# this branch's tip. Squash-merges land as brand-new commits, so merge-base
# ancestry can never prove them merged — without this check every
# squash-merged worktree would be refused forever. Matching the head commit,
# not just the branch name, matters twice over: a backlog branch name gets
# reused for a follow-up task, and a branch can gain commits after its PR
# merged. gh-only (no heuristics); absent/broken gh means "no".
is_pr_merged() {
    local tip="" heads=""
    command -v gh >/dev/null 2>&1 || return 1
    tip="$(git rev-parse --verify --quiet "$1^{commit}")" || return 1
    heads="$(gh pr list --head "$1" --state merged \
        --json headRefOid --jq '.[].headRefOid' 2>/dev/null)" || return 1
    grep -qxF "$tip" <<<"$heads"
}

# True when the branch tip was itself a tip of origin/develop at some point,
# i.e. the branch was cut from develop and never received a commit. Such a
# tip is an ancestor of develop, so ancestry alone reads a brand-new task
# worktree as "merged" — on 2026-09-14 an --all --apply sweep removed one
# three minutes after it was created. A branch merged with a merge commit
# enters develop as a second parent, so its tip is never on the first-parent
# line and stays retirable without asking GitHub.
is_unworked() {
    local tip=""
    tip="$(git rev-parse --verify --quiet "$1^{commit}")" || return 1
    # Collect first, then match: `rev-list | grep -q` would let grep close the
    # pipe early and pipefail would report rev-list's SIGPIPE as "no match".
    # shellcheck disable=SC2143
    [ -n "$(git rev-list --first-parent "$BASE" | grep -xF "$tip")" ]
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
    if is_unworked "$branch"; then
        is_pr_merged "$branch" || {
            echo "no commits beyond $BASE — never worked on (--abandon to retire)"
            return 1
        }
    elif ! git merge-base --is-ancestor "$branch" "$BASE" 2>/dev/null; then
        is_pr_merged "$branch" || { echo "not merged into $BASE"; return 1; }
    fi
    return 0
}

# --abandon: same safeguards as check(), but only for a branch that never got
# a commit — so nothing can be lost except the empty worktree itself. It
# takes an explicit name and never runs from the --all sweep.
check_abandon() {
    local path="$1" branch="$2" reason=""
    reason="$(check "$path" "$branch")" && {
        echo "already merged — retire it without --abandon"; return 1
    }
    case "$reason" in
        "no commits beyond "*) return 0 ;;
        "not merged into "*)
            echo "has commits of its own — push or merge them first"; return 1 ;;
        *) echo "$reason"; return 1 ;;
    esac
}

retire() {
    local path="$1" branch="$2"
    if git worktree remove "$path" 2>/dev/null; then
        git branch -d "$branch" >/dev/null 2>&1 || {
            # -d compares against the local HEAD, which can lag behind
            # $BASE, and squash-merged branches are never ancestors at all.
            # -D is confined to a tip that is provably in $BASE or is the
            # exact head of a merged PR — check() established one of them.
            { git merge-base --is-ancestor "$branch" "$BASE" 2>/dev/null ||
              is_pr_merged "$branch"; } &&
            git branch -D "$branch" >/dev/null 2>&1
        }
        echo "retired  $branch"
        return 0
    fi
    echo "failed   $branch — git refused removal"
    return 1
}

# Best-effort: leave origin/develop current so the next task branch starts
# fresh without a manual fetch. Runs only after successful retirements and
# never fails the cleanup itself.
refresh_base() {
    git fetch origin develop --quiet 2>/dev/null || \
        echo "warning: post-cleanup fetch of $BASE failed — fetch manually before branching"
}

if [ "${1:-}" != "--all" ]; then
    guard=check
    if [ "${1:-}" = "--abandon" ]; then guard=check_abandon; shift; fi
    target="${1:-}"
    [ -n "$target" ] || {
        echo "usage: worktree-cleanup.sh <branch|path> | --abandon <branch|path> | --all [--apply]" >&2
        exit 1
    }
    path="$(resolve_path "$target")" || {
        echo "no worktree matches '$target'" >&2
        exit 1
    }
    branch="$(branch_of "$path")"
    if reason="$("$guard" "$path" "$branch")"; then
        retire "$path" "$branch" || exit 1
        refresh_base
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
[ "$APPLY" -eq 1 ] && [ "$n" -gt 0 ] && refresh_base
[ "$APPLY" -eq 1 ] && echo "$n retired, $kept kept" ||
    echo "$n retirable, $kept kept — rerun with --apply"
