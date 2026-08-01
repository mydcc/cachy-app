---
id: BUG-0008
title: The toast array grows without a bound
type: bug
status: ready
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
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

- [ ] Pushing more than the cap leaves exactly the cap in the array
- [ ] Dropped toasts have their timers cleared, asserted with fake timers
- [ ] Existing toast tests still pass

## Links

- `docs/archive/plans/plan_proposal.md` — group 2, item 5
