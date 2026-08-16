---
id: BUG-0220
title: PR-to-issue auto-linking matches backlog IDs by substring and can close the wrong issue
type: bug
status: specced
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

Both received `Fixes #2002`. Neither touches `bitunixWs.ts`. Both were caught
by hand during conflict resolution; had either merged first, `#2002` would have
closed silently.

The two pieces of code that disagree are in `scripts/sync-github-issues.ts`.
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

- Extract the PR-matching rule into one function and call it from both line 183
  and line 739, so the `Fixes #` link and the `in-review` status can never
  disagree about which PRs belong to an item.
- Match on the `backlog-id:` label the script already treats as authoritative:
  resolve the PR's subject item from its linked issue's labels, or require the
  ID to appear in a declared position (a `Backlog-Id:` trailer, or the branch
  name segment) rather than anywhere in free text.
- If substring matching is kept as a fallback, anchor it on a word boundary so
  `BUG-0021` cannot match `BUG-00210`.
- Do not prepend a second `Fixes #` when the body already carries one for a
  *different* issue — that is the case this bug is about, and the current guard
  is blind to it. Log the conflict instead of guessing, so a human resolves it.
- Leave the milestone and issue-lookup paths alone. `existingIssues.find` on
  line 733 already keys on `backlog-id:` correctly and is not implicated.

## Acceptance criteria

- [ ] A test reproduces the defect and fails without the fix: an open PR whose
      title mentions an ID it does not implement is **not** linked to that
      item's issue
- [ ] The test passes with the fix
- [ ] A PR that legitimately implements an item is still linked, so the feature
      keeps working
- [ ] A PR body already carrying `Fixes #<other>` does not silently gain a
      second, contradictory link
- [ ] An item whose ID is merely *mentioned* by an unrelated open PR is not
      labelled `status:in-review` — the line 739 half of the same defect
- [ ] `BUG-0021` does not match `BUG-00210`

## Out of scope

- Removing auto-linking. The rule in `CLAUDE.md` requiring every PR to carry
  `Fixes #<issue>` stands; this is about making the link correct, not optional.
- Retroactively auditing already-merged PRs for wrong links. Worth doing if
  this turns out to have fired before, but it is a separate task with a
  different shape.

## Links

- [`BUG-0219`](BUG-0219-place-order-ordertype-field.md) — the fix whose PRs were
  mis-linked, and where the ID reassignment happened
- `scripts/sync-github-issues.ts` — `ensurePRsAreLinked`, and the
  `backlog-id:` key it already uses everywhere else
- `.github/workflows/sync-backlog.yml` — what runs it
- [`README.md`](../README.md) — front matter and status conventions
