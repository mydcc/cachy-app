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

**Not yet reproduced locally.** The bot branch is deleted from the remote, so
the exact commit graph the runner saw cannot be replayed today. The hypothesis
below is the most likely mechanism and needs a fixture to confirm or refute.

## Cause

Unknown. The most likely mechanism, from reading
`scripts/check-pr-base-revert.mjs`:

- The fork-era anchor is `forkRev = first^1`, where `first` is
  `git rev-list --reverse --first-parent base..head` — the oldest first-parent
  commit reachable from head but not base (lines 168-182).
- The line-level test treats a removed line as base-introduced only when
  `forkRev`'s version of the file does not already contain it (lines 226-237).
- If `auto-update-prs.yml` merged `develop` into the bot branch, and the
  agent's full-tree snapshot commit then landed *on top of that merge*, the
  first-parent ordering can put `forkRev` at the already-merged state. Every
  line the snapshot removed is then present in `forkRev`, so nothing counts as
  base-introduced and the check passes — even though the payload removes work
  `develop` gained.

That would make the guard blind precisely to the case the merge companion
(`auto-update-prs.yml`) creates, which is the case that matters.

## Fix

Determine the actual graph for #3718 before changing anything — do not fix the
hypothesis. Then:

- Add a fixture to `scripts/check-pr-base-revert.test.ts` that replays the
  #3718 shape: a branch that has merged base, followed by a full-tree snapshot
  commit, merged when base has moved further. It must fail.
- If the `forkRev` derivation is the cause, anchor it on the merge-base rather
  than on `first^1`, or additionally require that `forkRev` is not itself a
  commit that `base` already contains.

Leave the `GENERATED_BACKLOG_PATHS` exemption alone: it is reasoned, tested and
correct.

## Acceptance criteria

- [ ] The real #3718 commit graph is recovered or faithfully reconstructed, and
      the actual cause is written down
- [ ] A fixture reproduces the defect and fails without the fix
- [ ] The fixture passes with the fix
- [ ] The other two fixtures (#3296 and #3297) still pass

## Links

- BUG-0582 — the guard is not required, so even a correct pass/fail changes nothing
- BUG-0447 — the original incident class
