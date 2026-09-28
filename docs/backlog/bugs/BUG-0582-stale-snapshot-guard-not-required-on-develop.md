---
id: BUG-0582
title: The stale-snapshot revert guard is not a required check, so a PR that reverts develop merges anyway
type: bug
status: specced
priority: P0
milestone: none
editions: [community, pro, private]
area: repo
data_class: none
adr: none
depends_on: []
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

- [ ] "Stale Snapshot Revert Guard" appears in the required status checks for `develop`
- [ ] A test or a recorded check proves the guard now blocks: a PR that deletes
      a base-added file is refused at merge time, not merely reported red
- [ ] The `allow-base-revert` escape hatch is documented as the only way past it

## Links

- BUG-0447 — the agent-snapshot item this guard was written for
- BUG-0583 — the guard's own false negative on #3718
- PR #3720 — the manual restore
