---
name: worktree-cleanup
description: Retires a finished git worktree — removes the directory, untracks it from Gortex, and deletes the merged branch. Use after a PR is merged or a task is abandoned, as phase 3 of the Agent Lifecycle in AGENTS.md.
---

# Worktree Cleanup — Phase 3 of the Agent Lifecycle

`AGENTS.md` § "Agent Lifecycle: Check, Claim, Clean Up" requires every agent to
retire its worktree when the work is done or abandoned. This skill is that step.

**Cleanup has two halves that must both happen.** `git worktree remove`
untracks nothing from Gortex, and `gortex untrack` removes no directory. Doing
only one leaves a stale half behind — and a leftover tracked worktree is not
free: it is a full repo in the graph (~31k nodes for this project), so several
of them slow every graph query down until `explore` hits its deadline.

## Retire your own worktree (the normal case)

Run this **from the main checkout**, naming the worktree you just finished —
you cannot remove the worktree you are standing in:

```bash
bash scripts/worktree-cleanup.sh <branch-or-path>
```

It removes the directory, untracks it from Gortex, and deletes the branch.

## Sweep up (opt-in)

Only when explicitly asked to tidy the repo — never as a routine step, because
another agent's worktree may be in use:

```bash
bash scripts/worktree-cleanup.sh --all           # report only
bash scripts/worktree-cleanup.sh --all --apply   # actually retire them
```

## What it refuses, and why that matters

The script exits non-zero and changes nothing when the worktree has
**uncommitted changes**, is **not merged into `origin/develop`**, is the **main
checkout** or the **current worktree**, or has a **detectable agent session**.
It never passes `--force`.

Treat a refusal as information, not an obstacle:

- *uncommitted changes* — someone's work is in there. Ask before touching it;
  save a patch outside the repo first if it really must go.
- *not merged* — the branch still carries commits `develop` does not have.
  Removing the worktree keeps the branch, but check the work is not lost.

**Do not work around a refusal with `git worktree remove --force`.** The
refusal is the safeguard, and both failure modes it prevents are unrecoverable.

## Limits of the session check

Detection of a live agent session reads the `cwd` column of
`gortex daemon status`. A client configured with a *parent* directory as its
cwd — the usual fix for multi-repo setups — reports that parent, not the
worktree it is editing. So a hit is authoritative, a miss only means "unknown".
Prefer the targeted form over `--all` for exactly this reason.

## Related

- `scripts/index-worktree.sh` — the counterpart that registers a worktree at
  session start
- `OPENCODE.md` § "Worktree sessions" and `AGENTS.md` § "Working inside a git
  worktree" — why graph tools fail inside an unregistered worktree
