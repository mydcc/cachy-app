---
id: BUG-0583
title: The stale-snapshot revert guard reported success on a PR that did revert develop
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: repo
data_class: none
adr: none
depends_on: []
---

# BUG-0583 — The revert guard false-passed PR #3718

## Symptom

Even if BUG-0582 is fixed and the guard becomes required, it would still have
let one of the three damaging merges through. On PR #3718
(`bolt-journal-sort-schwartzian-4454809530252835231`, "⚡ Bolt: optimize journal
sorting with Schwartzian transform") the check "Stale Snapshot Revert Guard"
reported **SUCCESS**, yet that merge is one of the three that reverted
`develop`.

## Evidence

**Demonstrated** — from the check rollup and the restore's own measurement.

- `gh pr view 3718 --json statusCheckRollup` lists
  `SUCCESS  Stale Snapshot Revert Guard`.
- Commit `e0fd8cfa` (#3720) measured the window against `c1ab8fab^` and records
  that `#3680`, `#3681` and `#3718` each "contributed nothing" — their content
  was overwritten by the next stale merge in the same window. #3718's branch
  is the one that landed `journalSort.ts`; after the four merges
  `src/lib/journalSort.ts` did not exist at all.

So the guard was asked the right question and answered it wrongly for this
branch.

**The cause is now established from git, not inferred.** The PR's real head was
force-pushed away, but GitHub retains it at `refs/pull/3718/head`; fetching
that ref recovers the exact tree the runner saw.

- Merged head: `d6e58dec` (parent `ea116d72`)
- Squash on develop: `d0b5c7bf`, whose tree is **byte-identical** to
  `d6e58dec`'s tree (`f4fb2108…`) — GitHub applied the head tree wholesale
- `journalSort.ts` exists at `ea116d72` and is **missing at `d6e58dec`**

So the branch tip `d6e58dec` was itself a full-tree snapshot that reverted 189
files, committed on top of the good commit `ea116d72`. The branch never merged
`develop`; it just carried a stale tree forward.

## Cause

The guard is blind whenever the PR branch has **not merged the base branch**,
which is the normal shape for a branch cut from `develop` and the shape
AGENTS.md's "Jules Sandbox Hygiene" tells agents to produce ("Never `git merge`
or `git rebase` `origin/develop` mid-session").

Two anchors in `scripts/check-pr-base-revert.mjs` collapse onto each other in
that case. For #3718 (`base` = `9358fde2`, `head` = `d6e58dec`):

    merge-base(base, head)          = 9358fde2
    first  = oldest first-parent in base..head = d9ec403e
    forkRev = first^1                = 9358fde2

`forkRev == mergeBase`. The payload's removed lines are computed as
`countLines(mergeBase) − countLines(head)` (lines 216-222), and a line counts as
base-introduced only when `forkRev`'s copy lacks it (lines 226-237). When
`forkRev` **is** `mergeBase`, every removed line is by construction present in
`forkRev`, so `baseRemoved` is always `0` and the check can never fire.

This is not a subtle edge case — it is the default for any branch that has not
merged base. The guard only works when a base-merge commit exists on the
branch, because only then does a gap open between `merge-base` (the new base
tip) and `first^1` (the old fork point). The BUG-0447 fixture passes for
exactly that reason: it merges `develop` into the branch before snapshotting.

**Consequence.** The guard's coverage is the inverse of what is wanted. It
catches the stale snapshot that an agent produced *despite* following the
documented hygiene rule (merge base first, then snapshot), and misses the one
produced *by* following it.

## Fix

Anchor on content era, not on the commit graph. For each path where head
differs from the current base tip, decide staleness by asking when the head's
blob was last current on base:

- if `git log --find-object=<headBlob> <base>` reports an era **older** than the
  merge-base, the head carries a pre-merge snapshot for that path and base has
  moved on — a revert
- if the era is the merge-base itself, the change is the PR's own

This decides correctly in both shapes, needs no fork anchor, and cannot collapse.

Constraints, because this runs on every PR:

- sample the paths (the `MAX_SAMPLE_LINES` cap already exists) and bound each
  `git log` with a timeout, so a large PR cannot stall the check
- keep the `allow-base-revert` label escape hatch
- keep the `GENERATED_BACKLOG_PATHS` exemption — it is reasoned and tested
- an undecidable path (blob not found on base, timeout) must **not** pass
  silently; report it so a human looks

Do **not** try to fix this by walking first-parents to the first
base-reachable ancestor: for #3718 that value already *is* `9358fde2`, so it
changes nothing. That approach was tried against these refs and is a no-op.

## What was tried and rejected (PR #3725, closed unmerged)

A fix that added a **self-pass** over the branch's own first-parent commits,
judging each removed line against both the fork-era tree and the **base tree**
(so that a branch refining its own work is not read as a revert). That second
anchor was necessary and correct — without it the guard rejected a pure-docs PR
that rewrites its own backlog prose. It was not sufficient.

Measured on the real refs (`base` = `9358fde2`, `head` = `d6e58dec`):

    payload damage   187 files, 1717 deletions
    the fix reports  removed 1 base-added line(s):
                      src/components/shared/journal/JournalTable.svelte
                        -             } else {

The one line it finds is itself a **false positive** — a branch-owned duplicate
of `} else {` misattributed to the base. Reason: `forkRev == mergeBase` here,
so the fork anchor still governs and the self-pass inherits exactly the blind
spot it was added to remove. The base-tree anchor is consulted but cannot
rescue a case where every removed line is present at the fork anchor.

Worse, the fixture it shipped with modelled a **different mechanism**: a
`git checkout develop -- <file>` sync without merging. That can happen
(`auto-update-prs.yml`, a stash pop, an agent syncing its tree) but it is *not*
what #3718 did — the real branch chain is `d9ec403e → ea116d72 → d6e58dec` with
no sync commit. The test was load-bearing for a case that does not reproduce the
incident, which is the same reasoning error that produced this bug twice.

Shipping it would have been worse than shipping nothing: a required check on
`develop` that goes green reads as protection that is not there. **Nothing from
#3725 landed.**

Two findings from that review survive and belong to any future attempt:

- **A confirmed false negative, independent of the above.** `baseCounts` is
  read at `oldPath` only. If the base has since **renamed** the file, the base's
  copy is never consulted, every removed line is skipped as "not base work", and
  a real revert passes. Fall back to the new path, or merge both.
- **The base-only anchoring is uncalibrated.** Anchoring the self-pass on the
  base tree alone yields 115 findings on the real refs — including real ones
  (`deleted file with 71 base-added line(s): OPENCODE.md`) but with noisy sample
  lines (blank lines, `}`). It stays green on 5 legitimate branches. **Measure it
  against the last ~20 merged PRs before trusting it**: if it flags ordinary
  work, it is unusable as a required check.

## Acceptance criteria

- [ ] A fixture reproduces the defect — a branch that has **not** merged base,
      whose tip is a full-tree snapshot — and fails without the fix. The
      existing BUG-0447 fixture (branch *has* merged base) must keep failing, so
      both shapes are covered
- [ ] The fixture passes with the fix
- [ ] A PR whose head blob has no era on base is reported as undecidable rather
      than passed silently
- [ ] The check stays within a bounded time on a large PR
- [ ] The other two fixtures (#3296, #3297) still pass
- [ ] The new fixture is verified to fail **against the real refs** and not only
      in a synthetic repo. #3725's fixture passed while the real damage went
      uncaught; a synthetic pass is not evidence for this item
- [ ] The fix is calibrated: run against the last ~20 merged PRs on `develop` and
      it flags **none** of them, while flagging #3718. A guard that fires on
      ordinary work cannot be a required check
- [ ] A branch that refines its own work across commits is not reported — the
      regression #3725 introduced and had to be re-anchored to avoid

## Out of scope

- The `allow-base-revert` label and the `GENERATED_BACKLOG_PATHS` exemption.
  Both are reasoned, tested, and deliberately kept
- `bug0447` (branch *has* merged base), which the guard already catches. This
  item is the inverse shape
- Re-litigating BUG-0582's branch-protection setting. Applied and live
- Timing or performance work. The check runs in single-digit seconds on the
  187-file #3718 payload and ~0.2s on an ordinary branch

## Links

- BUG-0582 — the guard is not required, so even a correct pass/fail changes nothing
- BUG-0447 — the original incident class
- Recovered head: `git fetch origin pull/3718/head:refs/audit/pr3718` reproduces
  the exact tree the guard cleared (`d6e58dec`, tree `f4fb2108…`)
- PR #3725 — the rejected self-pass fix, closed unmerged. Its review is the
  source of the measured numbers above; the branch is preserved on `origin` as
  `fix/bug-0583-revert-guard-era` for anyone comparing approaches
