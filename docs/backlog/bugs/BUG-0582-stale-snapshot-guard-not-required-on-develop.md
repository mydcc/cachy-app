---
id: BUG-0582
title: The stale-snapshot revert guard is not a required check, so a PR that reverts develop merges anyway
type: bug
status: in-progress
priority: P0
milestone: none
editions: [community, pro, private]
area: repo
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: audit/last-2-days-review
applied: 2026-09-28
---

# BUG-0582 — The stale-snapshot revert guard is not a required check

## Symptom

On 2026-09-28 the Bolt, Palette and Bolt-squartz bot PRs (#3692, #3680, #3681,
#3718) were squash-merged and each replayed its stale sandbox tree over
`develop`. 23 files were deleted outright and roughly 200 more were reverted to
older content, including `tradeService.ts`, `orderGate.ts`, `bitunixWs.ts`,
`marketWatcher.ts`, both locale files and the whole `docs/bitget-api/`
directory. Four PRs' worth of intended work was lost with it. `develop` was
restored by hand in #3720 (commit `e0fd8cfa`).

Nothing about the merge was visible. The PR titles described only the intended
change, CI was green, and the reverted tests had been deleted along with the
code they tested.

## Evidence

**Demonstrated** — observed, and the mechanism is in the branch protection API.

The guard built for exactly this (BUG-0447, `34c7d7bd`, PR #3296, 2026-09-14)
exists at `.github/workflows/pr-base-revert-guard.yml` and runs
`scripts/check-pr-base-revert.mjs`. It **did its job**: on PRs #3680 and #3692
the check "Stale Snapshot Revert Guard" reported **FAILURE**. Both PRs were
merged anyway.

`gh api repos/mydcc/cachy-app/branches/develop/protection` lists the required
status checks as:

    Conventional Commits, Closing References, Decimal.js Enforcement,
    i18n String Compliance, Unit Tests, TypeScript Type Check, ESLint,
    Backlog & Documentation Links, check-translations

"Stale Snapshot Revert Guard" is not among them. Neither PR #3680 nor #3692
carried the `allow-base-revert` label, so the guard was not deliberately
waived — it was simply not required, and therefore had no veto.

## Cause

The guard was added as a *reporting* check, never added to the branch
protection required-checks list, and the workflow's own header comment
describes it only as a check that "fails the PR". A check nothing requires
cannot block a merge, so a red result on it is advisory. The incident it was
written to prevent then occurred two weeks later, at a scale the
one-PR-of-documentation half of the fix assumed away.

There is a second layer of the same defect. Adding the check to
`required_status_checks` is only half the mechanism: GitHub exempts admins from
required status checks while `enforce_admins` is off, and this repo has it off.
So even after the 2026-09-28 fix the guard had no veto against the merges it
exists to prevent, because the person performing those merges is an admin.
Measured on 2026-09-30, see the AC2 section.

## Fix

Add "Stale Snapshot Revert Guard" to the required status checks for `develop`.

Also decide deliberately whether `strict: true` is wanted for the required set
(it is currently on, which means the checks must pass against the *current*
`develop` tip — desirable for this guard, since its verdict depends on how far
`develop` has moved since the PR forked).

**And enable `enforce_admins`.** Added 2026-09-30 after the AC2 measurement: a
required check that the likely merger can bypass is not protection, and the
person who merges a stale snapshot during an incident is by definition an admin
with the token in hand. This is the part of the fix that was missing from the
original framing, which treated the required set as the whole mechanism.

Nothing to change in `scripts/check-pr-base-revert.mjs` itself; its detection
was correct for #3680 and #3692. Its blind spot — the guard reported SUCCESS on
#3718, which also did damage — is BUG-0583, and it is structural: the guard
cannot fire on a branch that has not merged base, which is the common case.

So this item alone does not close the incident class. Landing it stops two of
the three damaging merges; BUG-0583 is what stops the third.

## Acceptance criteria

- [x] "Stale Snapshot Revert Guard" appears in the required status checks for `develop`
- [x] A test or a recorded check proves the guard now blocks: a PR that deletes
      a base-added file is refused at merge time, not merely reported red
      — **refuted, see below**: the guard reported `FAILURE` and the merge
      succeeded, because `enforce_admins` is `false` and an admin token bypasses
      required checks. The required *setting* is live; the guard still has no veto.
- [ ] `enforce_admins` is enabled on `develop`, so the required set binds the
      people most likely to merge a stale snapshot
- [x] The `allow-base-revert` escape hatch is documented as the only way past it

## Shipped

Applied 2026-09-28 as a repository-settings change (no code, so no commit
carries it). `required_status_checks.contexts` on `develop` went from 9 to 10
entries with `Stale Snapshot Revert Guard` appended; a before/after diff of the
protection object confirms nothing else moved — `strict` still `true`,
`enforce_admins` still `false`, `required_conversation_resolution` still
`true`, and every other section byte-identical.

AC1 is satisfied: the required set is live, and the guard appears in the check
rollup of every open PR.

AC3 is satisfied: the `allow-base-revert` label escape hatch is documented in
the guard's own output.

## AC2 measured 2026-09-30: the guard reports red and the merge goes through

The behavioural proof was run as a throwaway PR, #3747. It reproduced the
BUG-0447 shape exactly: branched from `origin/develop~6`, committed one file,
merged the current `develop`, then pushed a full-tree snapshot of the pre-merge
tree as the branch tip (`b2865811`).

**The guard worked.** Locally and in CI it reported `FAILURE` and named the
damage — 39 files, 1868 deletions, including `src/lib/server/klineCache.ts` and
`AGENTS.md`. `mergeStateStatus` was `BLOCKED` while it ran.

**The merge succeeded anyway.**

    PUT /repos/mydcc/cachy-app/pulls/3747/merge
    -> {"sha":"a03a33692a990460d74c96b311594a4ffb730b14","merged":true}

The cause is in the protection object, not the guard:

- `required_status_checks.contexts` contains `Stale Snapshot Revert Guard`
- `enforce_admins.enabled` is `false`
- the merge was performed by `mydcc`, whose permission on the repo is `admin`

GitHub exempts admins from required status checks unless `enforce_admins` is on.
So for any admin merge — which is the merge a maintainer performs when reacting
to a bad incident — the required set is advisory, exactly as it was before
2026-09-28. The required set closed the automated-dispatch path (#3680, #3692)
and left the human path open.

Damage was reverted immediately in #3748 (`c3f6e5a9`): the tree on `develop` is
byte-identical to the pre-merge tip `fd9c3cd8`, verified with
`git diff --quiet fd9c3cd8 origin/develop`.

The honest status of this item is therefore **partial**: the setting is applied,
and the item is not done. Two things remain — enable `enforce_admins`, and
decide deliberately whether that is acceptable, because it binds the repo owner
too. The alternative to `enforce_admins` is not "leave it off": a required check
that the likely merger can bypass is a check that reads as protection and is not.

Two notes for whoever picks this up next:

- The sub-resource endpoint `PUT …/protection/required_status_checks` returns
  404 on this repo; the working call is `PUT …/protection` with the **full**
  object. `required_pull_request_reviews` and `restrictions` must both be
  present (`null` when unset) or the API answers 422.
- This closes two of the three damaging merges (#3680, #3692) **for
  non-admin merges only** — see the AC2 section for the admin bypass that was
  measured on 2026-09-30 and is still open. The third damaging merge, #3718, is
  BUG-0583 — a structural blind spot in the guard, not a settings gap. Do not
  treat this item as closing the incident class.

## Links

- BUG-0447 — the agent-snapshot item this guard was written for
- BUG-0583 — the guard's own blind spot on branches that have not merged base
- PR #3724 — the audit PR this item was filed in
- PR #3720 — the manual restore of the 2026-09-28 damage
- PR #3747 — the throwaway guard-proof PR, merged by admin despite a
  `FAILURE`; the measurement behind the AC2 section
- PR #3748 — the restore of the damage #3747 caused (`c3f6e5a9`)
