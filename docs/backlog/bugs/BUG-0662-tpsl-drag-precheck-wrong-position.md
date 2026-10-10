---
id: BUG-0662
title: TP/SL drag precheck validates against a position not proven to own the dragged plan
type: bug
status: done
priority: P1
milestone: none
editions: [community, pro, private]
area: execution
data_class: none
adr: none
depends_on: []
assignee: opencode
---

# BUG-0662 — TP/SL drag precheck validates against a position not proven to own the dragged plan

## Symptom

In hedge mode with a stale plan row, a dragged TP/SL line can be
validated against the wrong position's entry and side, then modify a
different row — landing a stop on the wrong side of its own position's
entry (immediately triggering or never triggering).

## Evidence

**Derived** from code reading; needs a stale plan row coexisting with a
different single open position on the same symbol, not yet reproduced
live.

- `src/lib/windows/implementations/CandleChartView.svelte:835-854` —
  `handleTpSlDrop` picks `position` by symbol alone
  (`candidates.length === 1 ? candidates[0]`); the `plan.positionId`
  match only runs when that shortcut found nothing. `venueOrderId`
  resolves to the plan's row id independently of the chosen position.
- The gate is self-referential here: `tpSlService.ts:289-292` builds
  `displayed` (`positionSide`, `entryPrice`) from caller-supplied
  context, and `orderGate.ts:1717-1726` (`checkTpSlDirection`)
  validates the payload against that same caller value — it cannot
  detect that context and order describe different positions.
- The venue resolves by id alone: Bitunix `modify_order` takes
  `orderId` plus the leg price, no `symbol`/`positionId`
  (`docs/bitunix-api/06_tp_sl.md:243-255`; `tpSlService.ts:280-284`).
- The simulator is stricter than the live path, which is the tell:
  `paperExchange.ts:504-513` derives the position from the **order**
  (`positions.find(p => p.positionId === orders[index].positionId)`)
  and validates levels against it.

## Cause

The validation context is resolved by symbol, not by plan ownership:
"the symbol's only position" is treated as the dragged plan's position
without proof.

## Fix

Resolve the validation context from the **plan**, never from the
symbol's only position: require `plan.positionId` to match a candidate
for the modify path (drop the `candidates.length === 1` shortcut
there), and refuse when the dragged plan carries no `positionId`.
Optionally carry `positionId` into `ModifyTpSlParams` / `displayed` so
the gate can cross-check order↔position the way `orderGate.ts:1085-1093`
already does elsewhere.

**Done (opencode).** The validation context now comes from the plan
first, and the single-candidate shortcut only applies where there is
nothing to contradict it:

```ts
const owningPlan = plan?.sourceOrderId === baseId ? plan : undefined;
let position: NormalizedPosition | undefined;
if (owningPlan?.positionId !== undefined && owningPlan.positionId !== null) {
    position = candidates.find((p) => String(p.positionId) === String(owningPlan.positionId));
} else if (candidates.length === 1) {
    position = candidates[0];
}
```

A plan that names a position is resolved by that name or refused; a plan
that names none still falls back to the symbol's single candidate, since
the venue does not always return one and refusing there would trade a
wrong-position drop for a false refusal on every such plan.

The `positionId` cross-check inside `ModifyTpSlParams` / `displayed` is
**not** part of this change. It would harden the gate, but it touches
every modify path's payload and the gate's own contract, and nothing
here needs it to close this defect — the wrong context no longer reaches
the gate in the first place. Left open deliberately rather than bundled.

## Acceptance criteria

- [x] A test with a stale plan row plus a different single open
      position on the same symbol reproduces the defect and fails
      without the fix (drop validated against the wrong entry)
- [x] The test passes with the fix — drop refused or resolved to the
      plan-owning position
- [x] Single-position non-hedge drags still work without a
      `positionId` regression (no false refusals)

## Links

- BUG-0660 (the drag path), BUG-0385 (plan-ownership check this extends)
