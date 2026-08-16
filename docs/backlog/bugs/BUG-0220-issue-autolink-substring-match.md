---
id: BUG-0220
title: PR-to-issue auto-linking matches backlog IDs by substring and can close the wrong issue
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: repo
data_class: none
adr: none
depends_on: []
---

# BUG-0220 — PR-to-issue auto-linking matches backlog IDs by substring and can close the wrong issue

## Symptom

A pull request gets `Fixes #<n>` prepended automatically, pointing at an issue
it does not fix. Nobody wrote the line by hand, and nothing flags it. If the PR
merges, GitHub closes an unfixed bug and advances the wrong Kanban card — the
defect is still there, but the board says it is done.

## Evidence

**Demonstrated** — it happened on 2026-08-16 to two pull requests at once.

`#2002` is *Tab inactivity drops WebSocket connection*, carrying
`backlog-id:BUG-0217`. Two open PRs fixed an unrelated defect — the missing
`orderType` field on Bitunix `place_order` — and were drafted under the same ID
before `#2005` claimed 0217 for the WebSocket bug:

- `#2003` — title `fix: send orderType to Bitunix place_order ... (BUG-0217)`
- `#2004` — title `fix(orders): send orderType instead of type ... (BUG-0217)`

Both received the closing keyword for `#2002`. Neither touches `bitunixWs.ts`.
Both were caught by hand during conflict resolution; had either merged first,
`#2002` would have closed silently.

### Second instance: the write-up closed it anyway

Worth recording, because it is the same failure through a different door and it
defeated the fix for the first one.

`#2003` was corrected to point at `#2008` before merging, and GitHub no longer
listed `#2002` among its closing references. `#2002` closed on merge regardless.
The cause was the commit message of `3d6c008` — the commit that added *this
file* — which described the mis-link by quoting it literally:

> ...this prepended `Fixes #<!-- -->2002` to both #2003 and #2004...

(The keyword above is deliberately broken with an empty HTML comment so that
quoting this file cannot repeat the incident. It renders as the original text
on GitHub and does not parse as a reference.)

GitHub parses closing keywords in merged commit messages as well as in PR
bodies, and quotation marks, backticks and surrounding prose do not exempt the
phrase. The squash commit `db4d908` carried the text into `develop`; the
release notes for `1.6.0-beta.54` recorded all three references. The issue was
reopened by hand.

### Third instance: the fix's own pull request

The pull request implementing this item described the second incident with the
sentence "the squash of #2003 closed #2002". `closed` is a closing keyword —
GitHub's set covers `close`/`closes`/`closed`, `fix`/`fixes`/`fixed` and
`resolve`/`resolves`/`resolved`, and only the position directly before the
reference matters. So the PR that exists to prevent this acquired a closing
reference to the same unrelated issue, and would have shut it again on merge.
Caught before merging, because the issue's `closed_by_pull_requests` listed it.

The convention first written into `CLAUDE.md` and `AGENTS.md` for the second
instance was wrong for the same reason: it advised naming the issue "without
the keyword" and gave `"closed #1770 in error"` as the example. Past tense
reads as description and parses as an instruction.

Two things follow, and they are why this item is worth more than its P2:

- The hand-rolled verification scan used `(Fixes|Closes|Resolves) #\d+` and so
  passed cleanly over `closed #2002`. A check narrower than the thing it
  checks is worse than no check, because it is believed.
- Three instances in one day, from three different mechanisms, by an author
  who had read the previous two. That is the argument for the `commit-lint`
  rule under "Not done" rather than for more care.

So the hazard is broader than the sync script: **any** text that reaches a
commit message or PR body can close an issue, including text whose only purpose
is to describe a closing reference. A bug write-up is a likely place for that to
happen, which makes it worth a convention rather than vigilance.

The two pieces of code that disagree are in `scripts/sync-github-issues.ts`.
All line numbers below describe the code **as it stood before the fix**; they
are kept because they are the evidence, and the fix moved them.

The script already knows what a stable identity looks like — line 37 defines
the label prefix and line 360 calls it "the stable lookup key for matching,
independent of title/body edits":

```ts
const BACKLOG_ID_LABEL_PREFIX = "backlog-id:";
```

The PR-matching path does not use it, and reaches for raw substrings instead
(line 183, in `ensurePRsAreLinked`):

```ts
const matchingPRs = openPRs.filter(pr =>
    pr.title.includes(item.id) ||
    pr.body?.includes(item.id) ||
    pr.head.ref.includes(item.id)
);
```

`String.includes` has no notion of which item a PR belongs to. Any mention of
an ID matches — including a PR that merely *cites* another item in its
description, and including an ID that has since been reassigned to a different
bug.

**The same filter is duplicated at line 739**, where it computes `hasOpenPR`,
which line 361 turns into the item's Kanban status:

```ts
const effectiveStatus = hasOpenPR && !isClosed ? 'in-review' : item.status;
```

So one mention of a foreign ID moves a second item's board column too. This is
not hypothetical either: `#2002` was left labelled `status:in-review` on
2026-08-16 while its own backlog file said `specced` and nobody was working on
it — `#2003`'s title mentioning `BUG-0217` was the entire cause. The two copies
of the filter have already drifted (the line 739 version has a fourth clause
matching an existing `Fixes #<n>`), which is its own reason to have one.

## Cause

Two independent weaknesses that compound:

1. **Identity by substring.** A PR is matched to an issue because some text in
   it contains the ID, not because it declares that item as its subject. A
   reviewer note reading "same class of bug as BUG-0215" is enough to link a PR
   to BUG-0215's issue.
2. **No re-check after the link is written.** The prepend is one-directional and
   happens once. When a backlog ID is reassigned — as 0217 was — the stale
   `Fixes #` line survives in the PR body, and the guard on lines 190–191 only
   checks whether *that same* issue is already referenced, so it never
   reconsiders a link it made earlier.
3. **The rule is written twice.** Lines 183 and 739 carry the same filter with
   different clauses, so a fix applied to one leaves the other intact — and
   the second one drives Kanban status rather than the `Fixes #` line, making
   the surviving half easy to miss.

Prefix collision makes it worse in the general case: `item.id` of `BUG-0021`
is a substring of `BUG-00210`, should the backlog ever pass four digits.

## Fix

The matching rule now lives in `scripts/lib/pr-issue-match.ts`, a module with no
environment dependencies, and `sync-github-issues.ts` calls it from both former
sites. The separate module is not decoration: the script calls `process.exit(1)`
at import time when `GITHUB_TOKEN` is unset, so while the rule lived inside it,
none of this could be tested at all.

- **One rule, two callers.** `matchPRsForItem` replaces both filters, so the
  `Fixes #` link and the `in-review` status can no longer disagree about which
  PRs belong to an item.
- **Declaration, not mention, and ranked.** `declaresBacklogItem` no longer ORs
  its signals: a `Backlog-Id:` trailer wins outright; failing that, a closing
  reference decides whenever the item's issue number is known; only then do the
  title and branch name apply. Free-text body matching is gone — that clause is
  what turned "same class of bug as BUG-0215" into a link. The ranking is what
  makes a stale title safe: #2003 declared the issue for BUG-0219 in its body
  while its title still named the reassigned BUG-0217, and its own declaration
  now settles that.
- **Anchored IDs.** `backlogIdPattern` rejects a trailing alphanumeric, so
  `BUG-0021` no longer matches `BUG-00210`. A trailing hyphen is still allowed,
  because `fix/BUG-0219-slug` is the branch and filename convention. `\b` alone
  would not have done this — the digit after `BUG-0021` is a word character on
  both sides.
- **Conflicts are reported, not guessed.** `decideLink` returns `already-linked`,
  `prepend`, or `conflict`. A body that already closes a *different* issue gets
  a warning naming both references and is left untouched; either one may be the
  correct link, and the script cannot tell which.
- **Left alone:** the issue lookup at the top of the main loop, which already
  keys on `backlog-id:` correctly, and the milestone and Project V2 field paths.

For the second instance, which no change to the sync script would have
prevented, the convention is now written into `CLAUDE.md` and `AGENTS.md`
alongside the PR-linking rule: to mention a closing reference rather than make
one, break the keyword or name the issue without it.

The convention is also **enforced**, by `scripts/lint-commit-refs.mjs`, wired
into `.github/workflows/commit-lint.yml`. The rule it applies is simpler than
the one first sketched here, and stronger for it: a commit message may not carry
a closing keyword at all. Deciding *which* issue a branch legitimately declares
is the same judgement this item just moved out of `String.includes`, and it is
not needed — `CLAUDE.md` already requires the link to live in the pull request
description, where it closes the issue and moves the Kanban card on its own. A
commit in this repo never needs one, so "none" is a rule with no false
positives to litigate.

Two details it gets right that a quick regex would not:

- The full keyword set including the past tense, which is what the hand-rolled
  scan missed.
- The whole `base..head` range, not just the tip. GitHub's squash merge
  concatenates every commit message in the PR into the merge body, so a keyword
  anywhere in the range lands on `develop`. This is a deliberate departure from
  the Conventional Commits step above it, which lints only the tip because an
  early WIP commit's *format* cannot be fixed without a history rewrite. That
  reasoning does not transfer: a wrongly closed issue is worth a rewrite.

Escapes pass: `Fixes #<!-- -->1770` does not match, because the keyword is not
directly followed by a reference.

## Acceptance criteria

- [x] A test reproduces the defect and fails without the fix: an open PR whose
      title or body mentions an ID it does not implement is **not** linked to
      that item's issue
- [x] The test passes with the fix
- [x] A PR that legitimately implements an item is still linked, so the feature
      keeps working
- [x] A PR body already carrying `Fixes #<other>` does not silently gain a
      second, contradictory link
- [x] An item whose ID is merely *mentioned* by an unrelated open PR is not
      labelled `status:in-review` — the second half of the same defect, now
      served by the same function
- [x] `BUG-0021` does not match `BUG-00210`
- [x] A commit message or PR body that quotes a closing keyword for an issue
      the change does not fix cannot close it — documented in `CLAUDE.md` and
      `AGENTS.md`, and enforced for commits by `scripts/lint-commit-refs.mjs`
      in the `commit-lint` workflow
- [x] The enforcement recognises the past tense and scans the whole PR range,
      verified against the commit that caused the second instance

A note on the title criterion, because it was briefly dropped and then met. The
first implementation treated a title as an unconditional declaration, on the
argument that `fix: ... (BUG-0219)` *is* how this repo names its work and that
ignoring it would break auto-linking for nearly every correct PR. That argument
is right about titles in general and wrong about this criterion: the answer is
not to trust titles less, but to rank them below an explicit declaration. A PR
that names the issue it closes has already said what it implements, and a stale
title cannot outvote that. Ranking the signals satisfies both — auto-linking
still works from a title alone, and the reassigned-ID case is closed.

## Out of scope

- Removing auto-linking. The rule in `CLAUDE.md` requiring every PR to carry
  `Fixes #<issue>` stands; this is about making the link correct, not optional.
- Retroactively auditing already-merged PRs for wrong links. Worth doing if
  this turns out to have fired before, but it is a separate task with a
  different shape.

## Links

- [`BUG-0219`](BUG-0219-place-order-ordertype-field.md) — the fix whose PRs were
  mis-linked, and where the ID reassignment happened
- `scripts/lib/pr-issue-match.ts` — the extracted rule, and
  `scripts/lib/pr-issue-match.test.ts` covering it
- `scripts/sync-github-issues.ts` — `ensurePRsAreLinked` and the main loop, both
  now calling the same matcher
- `scripts/lint-commit-refs.mjs` — the enforcement, wired into
  `.github/workflows/commit-lint.yml`
- `.github/workflows/sync-backlog.yml` — what runs the sync
- [`README.md`](../README.md) — front matter and status conventions
