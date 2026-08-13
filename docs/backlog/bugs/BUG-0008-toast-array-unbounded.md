---
id: BUG-0008
title: The toast array grows without a bound
type: bug
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
estimate: 8
size: XL
target_date: 2026-12-05
---

# BUG-0008 — The toast array grows without a bound

## Symptom

In a long session that produces many notifications faster than they expire, the
toast array grows unboundedly.

## Evidence

**Demonstrated by inspection**, re-verified 2026-08-01.
`src/services/toastService.svelte.ts:48` is a bare `this.toasts.push(toast)`
with no cap; removal happens only via the timeout filter at line 60. Nothing
enforces a maximum.

Minor in practice — toasts expire on their own — but a burst of errors (a
reconnect storm, a rejected-order loop) produces exactly the pattern that
outruns expiry.

## Fix

Cap the array. On exceeding the cap, drop the oldest. Track the timeout handles
so a dropped toast's timer is cleared rather than left to fire against a removed
entry.

## Acceptance criteria

- [x] Pushing more than the cap leaves exactly the cap in the array
- [x] Dropped toasts have their timers cleared, asserted with fake timers
- [x] Existing toast tests still pass

## Resolution

**RESOLVED** (2026-08-10). `src/services/toastService.svelte.ts` now caps the
array at `MAX_TOASTS = 5`; pushing past the cap evicts the oldest toast via
`shift()` and clears its pending `setTimeout` through a private `#timers`
map keyed by toast id, so an evicted toast's timer never fires against a
removed entry. Covered by `src/services/toastService.test.ts` (3 tests,
fake timers).

## Links

- `docs/archive/plans/plan_proposal.md` — group 2, item 5
