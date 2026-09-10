---
id: BUG-0431
title: The closing-reference auto-fix inserts a trailer the flip gate then rejects
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: ci
data_class: none
adr: none
depends_on: []
---

# BUG-0431 — The closing-reference auto-fix inserts a trailer the flip gate then rejects

## Symptom

A pull request that advances a multi-part backlog item without completing it
has no green path through the `Closing References` job, and the job argues with
itself to get there. Both failing steps are in the same job, and step 1 creates
the input step 2 rejects.

Observed on [#3122](https://github.com/mydcc/cachy-app/pull/3122), which closes
one of FEAT-0028's three schema gaps and leaves two open. Its description was
authored with a deliberate non-closing reference and a sentence saying so. The
job's auto-fix rewrote the description to begin with `Fixes #1792`, and the next
step in the same job then failed:

```
❌ [backlog-flip] #1792 links to backlog item FEAT-0028, but this PR does not
flip it to done. Set `status: done` in the item file, regenerate the index and
commit both — no bot does it after the merge.
```

The demanded flip would have been a false claim: FEAT-0028 has open gaps, the
WebGPU leg of criterion 4 and criterion 1's recorded market series.

## Evidence

**Demonstrated.** Two runs on #3122: the auto-fix
([run 34498536732](https://github.com/mydcc/cachy-app/actions/runs/34498536732))
and the failure it produced
([run 34499543838](https://github.com/mydcc/cachy-app/actions/runs/34499543838)).
The PR description at that point read, verbatim:

```
Fixes #<!-- -->1792

Closes the first of the three schema gaps recorded on FEAT-0028. Refs #1792 —
deliberately no closing keyword, the item has two gaps and the WebGPU leg still open.
```

Line 1 was inserted by CI. Line 3 was written by the author. They contradict
each other.

There is a second, quieter defect in the same module.
`scripts/lib/backlog-flip.ts` exports `NO_ISSUE_RE` and its doc comment
promises the opt-out:

```
 * - no trailer, or an explicit `[no issue]` marker: pass
```

`checkBacklogFlip` never reads it. The function's only escape is
`findFixesTrailer(body) === null`, so a description carrying **both**
`Fixes #N` and `[no issue]` still fails — which is exactly the state the
auto-fix produces from a body that opted out. The opt-out works today only
because `checkBodyHasClosingRef` in `scripts/lib/pr-issue-match.ts` honours the
marker first and so suppresses the auto-fix. Two modules have to agree for a
documented feature to work, and only one of them implements it.

### Two more places the bot removal was not propagated

**The trailer regex does not understand code fences.** `FIXES_TRAILER_RE` is
`/^Fixes #(\d+)\b/m`, so a line-start trailer inside a fenced block counts as
one. The pull request that first reported this bug quoted the offending
description verbatim and was refused by the gate it was describing — the same
`#1792` flip demand, from inside a code fence. Quoting the evidence requires
breaking the keyword by hand.

**Two instruction files still describe the deleted bot.** `AGENTS.md:125` and
`docs/backlog/README.md` were updated to the new policy; `CLAUDE.md` and the
directory tree in `docs/backlog/README.md` were not, and said the opposite:

```
Never run `npm run backlog:index` and commit `INDEX.md` yourself — CI
regenerates and commits it directly to `develop` after merge, so it never
appears in a PR diff
```

CI now fails a PR whose backlog index is stale, so an agent following the
project's own instructions produced a red check. Corrected in this PR, because
an instruction that actively misdirects the next reader is worse than a wider
diff. It is listed here because it shares this bug's root cause: removing the
bot changed four things and only two of them were updated.

## Cause

The two steps encode different models of what a closing trailer means.

`scripts/lint-pr-body-refs.ts` treats a missing trailer as an omission to
repair, and repairs it from the branch's linked issue. That was correct while a
post-merge bot flipped backlog items; the trailer was a *link*, and being
generous about adding one cost nothing.

The develop commits that removed `.github/workflows/backlog-auto-done.yml` and
`scripts/backlog-auto-done.mjs` changed what the trailer *promises*: it now
means "this diff sets that item to `status: done`". Under the new meaning a
trailer cannot be inferred, because only the author knows whether the item is
finished. The auto-fix was not taught the new meaning.

## Fix

**The auto-fix must not insert a trailer whose promise it cannot verify.**
Before rewriting a description, resolve the candidate issue's labels; if it
carries a `backlog-id:` label and that item's status on the base branch is not
terminal, do not insert the trailer. Fail the presence check with a message that
names both options — a closing trailer plus the flip in this diff, or the
`[no issue]` marker — and let the author choose. An author choosing wrongly is
recoverable; CI choosing for them is what produced the contradiction above.

**Make `checkBacklogFlip` honour its own documented opt-out.** Return `pass`
when `NO_ISSUE_RE` matches, before the trailer lookup. That is the exported
constant the module already carries and the behaviour its doc comment already
claims, so this closes a documentation/implementation gap rather than adding a
rule.

Leave alone: the flip requirement itself. Requiring the fix PR to flip its own
item is the right call and is why this was caught at all — the old bot flipped
items after the merge, where nobody reviewed the claim.

## Acceptance criteria

- [ ] A test reproduces the defect and fails without the fix: a body with
      `Fixes #N` and `[no issue]` currently fails `checkBacklogFlip` and must
      pass
- [ ] A test pins that the auto-fix declines to insert a trailer for a
      non-terminal backlog mirror issue, and that the presence check then fails
      with a message naming both options
- [ ] `NO_ISSUE_RE` is read by `checkBacklogFlip`, not merely exported
- [ ] A PR advancing a non-terminal backlog item reaches green without editing
      a backlog status it does not complete
- [ ] A trailer inside a fenced code block is not read as a trailer, so a PR
      can quote a description it is reporting on
- [ ] No instruction file still describes the post-merge index bot

## Links

- [`FEAT-0028`](../features/FEAT-0028-indicator-alerts.md) — the item whose open gaps surfaced this
- `scripts/lib/backlog-flip.ts` — the gate, and the unused `NO_ISSUE_RE`
- `scripts/lib/pr-issue-match.ts` — where the marker *is* honoured
- `scripts/lint-pr-body-refs.ts` — the auto-fix
- `.github/workflows/pr-body-lint.yml` — both steps, one job
