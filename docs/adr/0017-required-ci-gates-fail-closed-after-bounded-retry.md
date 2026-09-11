# ADR-0017: A required CI gate fails closed after bounded retry

- **Status:** Proposed
- **Date:** 2026-09-11
- **Deciders:** repository maintainers

## Context

The `Closing References` job in `.github/workflows/pr-body-lint.yml` runs two
steps over one PR description: `scripts/lint-pr-body-refs.ts` lints and repairs
it, and `scripts/check-backlog-flip.ts` enforces that a PR closing a backlog
mirror issue flips that item to `status: done` in its own diff.

BUG-0431 recorded the failure mode of the opposite policy: the repair step
inserted a `Fixes #N` trailer that the flip gate then rejected, and on an
infrastructure lookup failure the two steps could disagree — one inserting a
closing reference, the other skipping validation. A required gate that passes
on unknown state cannot protect a merge, which is the irreversible step.

## Decision

1. **A required CI gate fails closed after bounded retry.** A lookup that still
   fails after a small number of retries with backoff and jitter produces a
   red, re-runnable check with an infrastructure-failure message — never a
   silent pass. `scripts/lib/retry.ts` provides the bounded retry.
2. **An automated repair step must not add a closing reference it cannot
   verify.** It may remove or neutralize closing references, which is strictly
   safety-increasing, and may add one only after positively resolving the
   linked backlog item's state (`scripts/lib/pr-issue-match.ts`).
3. **Decision logic stays pure and unit-tested, separate from I/O.** The
   runners own `gh`/`git`; the libraries decide (`scripts/lib/backlog-flip.ts`,
   `scripts/lib/pr-issue-match.ts`).

## Consequences

### What this enables

- A merge cannot silently proceed on an unread infrastructure lookup.
- The repair step and the flip gate cannot contradict each other on a flake.
- The verified/unverified distinction is explicit and testable.

### What this costs

- A sustained GitHub API or git failure turns every backlog PR red until a
  re-run. Bounded retry and jitter absorb the common transient case, not a
  sustained outage.

### What is now forbidden

- Treating an infrastructure lookup failure as a pass in a required gate.
- Inserting `Fixes #N` (or any closing trailer) when the linked item's state
  could not be verified.
