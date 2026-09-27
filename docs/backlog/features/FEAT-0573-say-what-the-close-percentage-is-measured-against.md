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
43.75 % of the position, not 75 %.

Nothing is wrong with that arithmetic. It is what the venue does, and
`quantityFromPercent` in [`partialClose.ts`](../../../src/lib/calculators/partialClose.ts)
documents it as deliberate: a percentage bound to a live position naturally expresses a
share of *what is left*. The displayed percentage is derived from the amount rather than
stored beside it, so the number on the handle and the number that would be submitted
cannot drift apart.

The problem is that none of that is on screen. A trader used to a fixed ladder — 25/50/75/100
read as cumulative marks — presses 25 % three times, sees 43.75 % of the position still
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
      each other: `percentFromQuantity(quantityFromPercent(p))` returns `p` for every
      whole multiple of the step
- [x] The wording does not imply the percentage is anchored to the size the dialog
      opened with, because it is not
- [x] `quantityFromPercent`, `percentFromQuantity` and the `PartialCloseContext` shape
      are unchanged — no second copy of the position size is introduced anywhere
- [x] Both locale strings are added and `npm run i18n` parity stays green

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

A labelling change and nothing else. One new locale key per language,
`positionsList.closePercentBasis` — "Share of the position size the venue
currently reports — two 50 % closes half of what is left" / "Anteil der
aktuell gemeldeten Positionsgröße — zweimal 50 % schließt die Hälfte des
Restes" — rendered as a caption under the slider in `PartialCloseInput`, so
every current and future mount point inherits it from the one place that owns
the control. The wording names the size the venue reports *now* and carries the
"two 50 %" example that answers the ladder misreading directly, the same
device `addSliderLabel` already uses for the add-side slider.

`partialClose.ts` is untouched: `quantityFromPercent`, `percentFromQuantity` and
`PartialCloseContext` keep their shapes, and no second copy of the position size
exists anywhere. The absolute quantity was already on screen and already the
submitted one — the modal passes the same `Decimal` to `closePosition` — so the
second acceptance criterion needed pinning, not building.

TDD: the three caption and wording tests were RED before the strings and the
markup existed (`expected 'Close 0%25%50%…' to contain 'the position size the
venue currently reports'`, and both catalogues missing the key), green after.
The rest are contract pins that were green throughout, which is the honest
shape here: the arithmetic was already right and is what the new words now
promise. 101 whole-percent round trips through
`percentFromQuantity(quantityFromPercent(p))`; the modal test proves 25 % of two
contracts shows `0.5` *and* sends `0.5`, and that the same 25 % of a size that
doubled under the dialog shows `1`. 40/40 input + modal component tests,
238/238 calculator tests, 439/439 calculators + architecture, 17/17 flash-close.
`generate-i18n-types` (3820 keys), `validate-i18n` and `lint-i18n` clean.

Also fixed in [`TODO.md` 29](../../TODO.md#29-does-a-close-percentage-mean-a-share-of-the-original-position-or-of-what-is-left),
whose worked example said a second 50 % of a 2-contract position is "not a
quarter of the original" — in that example it *is* a quarter of the original.
The item and the entry now read identically.
