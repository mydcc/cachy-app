---
id: BUG-0443
title: Switching builder tabs wipes the condition the trader just configured
type: bug
status: in-progress
assignee: claude
branch: worktree-super-alert-epic-open-5b8b1b
priority: P1
milestone: M4
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0012
depends_on: []
---

# BUG-0443 — Switching builder tabs wipes the condition the trader just configured

## Symptom

Configure a condition in one builder tab of the alert panel, switch to another
builder tab, and the condition is gone. Switching back shows an empty form. The
arm button goes disabled. Nothing warns the trader that the work was discarded.

Worked example:

1. Open the alert panel, Indicators tab.
2. Configure `RSI(14) > 70`. The rule sentence renders, arm is enabled.
3. Click the Price tab.
4. Click back to Indicators. The indicator choice is gone.

## Evidence

**Derived** — the defect follows from reading three pieces of code that
disagree about who owns `draft.conditions`. Nobody has filed an observed
incident yet.

The three pieces:

1. `src/stores/alertPanel.svelte.ts:226` — `setSingleCondition()` replaces the
   **whole** conditions group, not the caller's own contribution:

   ```ts
   setSingleCondition(condition: Condition | null) {
     this.draft.conditions = { kind: "group", op: "all", of: condition ? [condition] : [] };
   }
   ```

2. `src/components/alerts/tabs/IndicatorsTab.svelte:66` — the tab reads the
   draft **once at init**, by its own comment's design ("Read once at init,
   like every other builder: from here the form owns the document"). A draft
   holding a price condition makes `readIndicatorForm()` return `null`, so
   `chosenId` is `null` and `entry` is `null`.

3. `src/components/alerts/tabs/IndicatorsTab.svelte:85` — the write-through
   `$effect` runs on mount, sees `!entry`, and calls
   `setSingleCondition(null)` — emptying the group before the trader has
   touched anything.

The same collision exists in the other direction:
`src/components/alerts/tabs/PriceTab.svelte:89` reads
`readPriceForm(draft.conditions)`, which returns `BLANK_PRICE_FORM` for a
condition it cannot represent (`src/lib/alerts/priceConditionForm.ts:80`), and
the effect at `PriceTab.svelte:177` writes that blank form straight over the
draft. `CandlesticksTab.svelte:78` follows the same shape.

The wipe therefore happens on **mount**, not on edit — which is why it is
invisible in any test that exercises one tab at a time. Every existing
`*.component.test.ts` for these tabs mounts exactly one tab.

## Cause

"Read once at init, then the form owns the document" is a correct rule for a
single builder and a wrong rule for several builders sharing one document. Each
tab's mount-time write-through asserts ownership over the entire condition tree,
including the part another tab authored.

The comment on `setSingleCondition()` names the intent — "never leaves a stale
condition behind that the trader has since edited away" — which is right for an
edit the trader made and wrong for a mount the trader merely navigated to.

## Fix

The fix direction is a design decision, not a mechanical change, because the
replacement path is the specification (see FEAT-0030, which extends this same
group to several conditions). Three candidates:

- **Gate the mount write.** The write-through skips its first run when the form
  was initialised blank from a condition another tab authored. Smallest diff;
  leaves the ownership model intact and therefore the error class open.
- **Per-tab condition slots.** Each builder owns an addressable member of the
  group rather than the group. Closes the error class, and is the shape
  FEAT-0030's Combo tab needs anyway.
- **Confirm before discard.** Keep the wipe, but ask. Rejected as a
  starting point: it makes the trader responsible for a bug.

**Decided: the slot model** (2026-09-12), because it is the mechanism rather
than the discipline, and because FEAT-0030 has to build it regardless.

As built, in `src/lib/alerts/conditionSlots.ts`:

- The slot is **derived from the condition's own shape** (`slotOf()`), not
  recorded beside it. A parallel slot→condition map would be a second source of
  truth that can drift from the document the core validates.
- A slot is claimed only for shapes a builder can round-trip. Anything else — a
  volume comparison, a window, a nested group — is unclaimed, and an unclaimed
  condition is one no builder replaces or removes. Unknown means keep.
- An **ambiguous** slot (more than one member claiming it) is not a
  single-condition builder's to read *or* write. That preserves the older guard
  — a combo must not be shown as its first leg — and stops a mount-time write
  from deleting a leg of one.
- `setSlotCondition()` untracks its read of the group. Builders call it from a
  write-through `$effect`, so a tracked read of what they are about to write
  loops until Svelte aborts (`effect_update_depth_exceeded`).

`setSingleCondition()` survives for seed paths only (`seed()`, FEAT-0395), where
the caller owns the whole draft because it has just called `reset()`. Its
null-clearing behaviour is unchanged — it is load-bearing for the disabled arm
button.

## Acceptance criteria

- [x] A component test mounts one builder tab, configures a condition, unmounts
      it, mounts a second builder tab, and asserts the first condition survives
      — `builderTabHandover.component.test.ts`, both directions
- [x] That test fails against the current code — 3 of its 4 cases failed before
      the fix, the fourth being the deliberate-clear guard, which passed then and
      still passes
- [x] Round-tripping Price → Indicators → Price preserves both the condition
      and the form fields the trader typed — the threshold and the chosen kind
      are asserted off the rehydrated DOM, not only off the document
- [x] A condition the trader deliberately clears still empties the group and
      still disables the arm button — the test asserts the empty group, which is
      what the shell's `hasCondition` reads to disable arming
- [x] No German or English strings added (no new UI surface)

## Links

- `docs/adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md`
- [`FEAT-0030`](../features/FEAT-0030-combined-alerts.md) — the Combo
  tab that extends this group; the slot model is shared work
- [`FEAT-0389`](../features/FEAT-0389-super-alert-panel.md) — the shell that
  code-splits and therefore unmounts the tabs

## Verification (2026-09-12)

- `vitest --project components src/components/alerts/` — 68 passed (7 files)
- `vitest --project unit src/lib/alerts src/lib/rules src/stores` — 615 passed
  (47 files), including 8 new for `conditionSlots` and 9 new for
  `setSlotCondition`
- `svelte-check` — 0 errors, 5 warnings, all pre-existing and in other files
- No existing test's expectation was changed. The three that pinned
  `soleCondition`'s "a combo reads as blank" rule still pass unchanged, because
  the ambiguous-slot rule keeps that property.
