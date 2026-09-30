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

## Fix

Add "Stale Snapshot Revert Guard" to the required status checks for `develop`.

Also decide deliberately whether `strict: true` is wanted for the required set
(it is currently on, which means the checks must pass against the *current*
`develop` tip — desirable for this guard, since its verdict depends on how far
`develop` has moved since the PR forked).

Nothing to change in `scripts/check-pr-base-revert.mjs` itself; its detection
was correct for #3680 and #3692. Its blind spot — the guard reported SUCCESS on
#3718, which also did damage — is BUG-0583, and it is structural: the guard
cannot fire on a branch that has not merged base, which is the common case.

So this item alone does not close the incident class. Landing it stops two of
the three damaging merges; BUG-0583 is what stops the third.

## Acceptance criteria

- [x] "Stale Snapshot Revert Guard" appears in the required status checks for `develop`
- [ ] A test or a recorded check proves the guard now blocks: a PR that deletes
      a base-added file is refused at merge time, not merely reported red
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

**AC2 is not satisfied.** "PR #3724 reports `mergeStateStatus: BLOCKED`" is not
proof that the guard blocks — `BLOCKED` is what *any* unmet required check
produces, and #3724 has other failing checks. What is actually proven is that
the check *runs and is required*. The behavioural proof still owed is a
throwaway PR that deletes a base-added file and is refused at merge.

AC3 is satisfied: the `allow-base-revert` label escape hatch is documented in
the guard's own output.

Two notes for whoever picks this up next:

- The sub-resource endpoint `PUT …/protection/required_status_checks` returns
  404 on this repo; the working call is `PUT …/protection` with the **full**
  object. `required_pull_request_reviews` and `restrictions` must both be
  present (`null` when unset) or the API answers 422.
- This closes two of the three damaging merges (#3680, #3692). The third,
  #3718, is BUG-0583 — a structural blind spot in the guard, not a settings
  gap. Do not treat this item as closing the incident class.

## Links

- BUG-0447 — the agent-snapshot item this guard was written for
- BUG-0583 — the guard's own blind spot on branches that have not merged base
- PR #3724 — the audit PR this item was filed in
- PR #3720 — the manual restore of the 2026-09-28 damage
