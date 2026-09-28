---
id: FEAT-0573
title: Say what the partial-close percentage is measured against
type: feature
status: done
assignee: opencode
branch: feature/feat-0573-close-percent-basis
shipped: unreleased
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# FEAT-0573 — Say what the partial-close percentage is measured against

## Problem

The partial-close slider runs 0–100 % against the size the venue reports **now**. So
closing 50 % of a 2-contract position leaves 1 contract, and a second 50 % closes 0.5 —
half of the remainder, not half of the original. Three presses at 25 % therefore close
57.8 % of the position, not 75 %, leaving 42.2 % open.

Nothing is wrong with that arithmetic. It is what the venue does, and
`quantityFromPercent` in [`partialClose.ts`](../../../src/lib/calculators/partialClose.ts)
documents it as deliberate: a percentage bound to a live position naturally expresses a
share of *what is left*. The displayed percentage is derived from the amount rather than
stored beside it, so the number on the handle and the number that would be submitted
cannot drift apart.

The problem is that none of that is on screen. A trader used to a fixed ladder — 25/50/75/100
read as cumulative marks — presses 25 % three times, sees 42.2 % of the position still
open, and has no way to tell whether the control is broken or they are misreading it.
`PartialCloseInput` already offers a typed absolute quantity for anyone who wants a
specific size, so the capability exists; only the statement of what the slider means is
missing.

The confusion costs thinking, not money: the quantity that reaches the venue is whatever
the handle says, and the handle agrees with it. But a control a trader cannot predict is a
control they will stop trusting, and this one reduces a position.

## Proposal

Leave the arithmetic exactly as it is. State its basis in the UI, in both locales, and
keep the resolved absolute quantity visible while the slider moves.

The percentage is a ratio, and the trader needs the number. Showing both is a labelling
change, not a maths change — which is the whole point: the maths was already right, and
the fix costs no second copy of the position size.

## Acceptance criteria

- [x] The slider states what it is a percentage *of* — the position size the venue
      currently reports — in both locales, next to the control
- [x] The absolute quantity the slider currently resolves to stays visible while it is
      dragged, and is the quantity that would be submitted
- [x] Moving the position size underneath the open dialog changes the resolved quantity,
      and the displayed percentage and the displayed quantity remain consistent with
      each other: on a position that divides cleanly by the step and carries no venue
      minimum, `percentFromQuantity(quantityFromPercent(p))` returns `p` for every whole
      percentage `p` — where either quantity rule is not the identity, the round trip is
      the documented rounding, not a drift
- [x] The wording does not imply the percentage is anchored to the size the dialog
      opened with, because it is not
- [x] `quantityFromPercent`, `percentFromQuantity` and the `PartialCloseContext` shape
      are unchanged — no second copy of the position size is introduced anywhere
- [x] Both locale strings are added and the i18n checks stay green —
      `node scripts/generate-i18n-types.js`, `node scripts/validate-i18n.js`,
      `node scripts/lint-i18n.js`

## Out of scope

- Anchoring the percentage to the size the position had when the dialog opened. Decided
  in [`TODO.md` 29](../../TODO.md#29-does-a-close-percentage-mean-a-share-of-the-original-position-or-of-what-is-left):
  it reintroduces a second copy of a value that goes stale the moment the position moves
  under the dialog, which is exactly the class of bug the current design avoids.
- A toggle between the two bases, for the same reason [`FEAT-0526`](FEAT-0526-kill-switch-explained-and-configurable-in-settings.md)
  resolved the kill switch: two semantics behind one control, and the one that gets
  misread is the permissive one.
- The gate's quantity rules — step rounding down, the venue-minimum floor, and 100 %
  passing through unrounded. Untouched and still owned by
  [`partialClose.ts`](../../../src/lib/calculators/partialClose.ts).
- The realised-PnL figure shown beside the quantity — that is
  [`FEAT-0574`](FEAT-0574-say-when-the-close-pnl-mark-is-derived-not-reported.md).

## Links

- [`TODO.md` 29](../../TODO.md#29-does-a-close-percentage-mean-a-share-of-the-original-position-or-of-what-is-left) — the decision and its full reasoning
- `src/lib/calculators/partialClose.ts` — `quantityFromPercent`, `percentFromQuantity`
- `src/components/shared/PartialCloseInput.svelte` — the slider and the typed field
- `src/components/shared/ClosePositionModal.svelte` — the dialog that mounts the input

## What shipped

A labelling change, an accessibility association, and nothing else. One new
locale key per language, `positionsList.closePercentBasis`, rendered as a
caption under the slider in `PartialCloseInput` — so every current and future
mount point inherits it from the one place that owns the control. `RangeSlider`
gained an optional `describedBy` prop, and the close slider passes the
caption's id: the slider's own label is an `aria-label` and renders nothing
visible, so the caption is the only statement of the basis on screen, and
`aria-describedby` is what carries it to a screen reader moving the handle.
The two other `RangeSlider` mounts are untouched and inherit the prop as
optional.

Wording, which is the deliverable here: "Share of the position size the venue
currently reports — pressing 50 % twice closes half of what is left, not the
whole position" / "Anteil der aktuell von der Börse gemeldeten Positionsgröße
— zweimal 50 % schließt die Hälfte des Restes". Both name the size the venue
reports now, both attribute it to the venue, and both carry the worked example
that answers the ladder misreading — the same device `addSliderLabel` already
uses for the add side.

`partialClose.ts` is untouched: `quantityFromPercent`, `percentFromQuantity` and
`PartialCloseContext` keep their shapes, and no second copy of the position size
exists anywhere. The absolute quantity was already on screen and already the
submitted one — the modal passes the same `Decimal` to `closePosition` — so that
acceptance criterion needed pinning, not building.

TDD: the caption and wording tests were RED before the strings and the markup
existed (`expected 'Close 0%25%50%…' to contain 'the position size the venue
currently reports'`, both catalogues missing the key), green after. The rest are
contract pins that were green throughout, which is the honest shape here: the
arithmetic was already right and is what the new words now promise. 101 whole
percentages of the clean fixture round-trip through
`percentFromQuantity(quantityFromPercent(p))`; the modal test proves 25 % of two
contracts shows `0.5` *and* sends `0.5`, and that the same 25 % of a size that
doubled under the dialog shows `1`.

Worth knowing when reading those tests: the round trip holds where both quantity
rules are the identity — step rounding and the venue-minimum floor. It does not
hold on the coarse fixture (50 % of 0.7 rounds down to 0.3) nor with a
`minTradeVolume` above a small partial (1 % of 2 with a 0.5 minimum resolves to
0.5, i.e. 25 %). Both are the documented rules doing their job, so neither
fixture is used, and the header says so.

Also fixed in [`TODO.md` 29](../../TODO.md#29-does-a-close-percentage-mean-a-share-of-the-original-position-or-of-what-is-left),
whose worked example said a second 50 % of a 2-contract position is "not a
quarter of the original" — in that example it *is* a quarter of the original.
The item and the entry now read identically.
