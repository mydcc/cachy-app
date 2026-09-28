---
id: BUG-0561
title: Invalid add and close quantity drafts silently revert and submit the old amount
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: []
---

# BUG-0561 — Invalid add and close quantity drafts silently revert and submit the old amount

## Symptom

After a user enters an invalid add or partial-close quantity, the field silently returns to its previously committed value and the action button remains enabled. Pressing the action can submit a different quantity from the one most recently typed.

## Evidence

**Derived.** `src/components/shared/AddToPositionInput.svelte:149-166` clears an invalid draft and returns silently on blur; `PartialCloseInput.svelte:100-123` has the same behavior. The parent controls keep the prior committed quantity and leave their submit buttons enabled in `AddToPositionModal.svelte:251-258` and `ClosePositionModal.svelte:219-228`.

## Cause

Invalid transient input is treated as a no-op rather than a visible draft error, while the committed value remains eligible for submission.

## Fix

Keep invalid drafts visible, show a field-level reason, and disable submission until the user corrects or explicitly reverts the draft. Distinguish local invalid input from an unmeasurable venue quantity.

## Acceptance criteria

- [ ] Negative, zero, non-finite, and malformed drafts remain visible with inline errors.
- [ ] Submit is disabled while the draft is invalid.
- [ ] Explicit revert restores the previous committed value.
- [ ] Valid values rounded by step/minimum report the resulting committed amount.
- [ ] Add and partial-close paths have regression tests.

## Out of scope

- Venue rejection of metadata-complete but otherwise valid quantities.
- Minimum-volume rounding/refusal already owned by BUG-0509.

## Links

- `src/components/shared/AddToPositionInput.svelte:149-166`
- `src/components/shared/PartialCloseInput.svelte:100-123`
- `src/components/shared/AddToPositionModal.svelte:251-258`
- `src/components/shared/ClosePositionModal.svelte:219-228`
- Existing coverage: BUG-0509; no existing item records silent draft reversion.
