---
id: FEAT-0612
title: Adopt the button primitive in the calculator and trade panel
type: feature
status: ready
priority: P2
milestone: none
created: "2026-10-03"
editions: [community, pro, private]
area: ui
parent: FEAT-0605
data_class: none
adr: none
depends_on: [FEAT-0610]
---

# FEAT-0612 — Adopt the button primitive in the calculator and trade panel

The calculator is where a user spends most of their time and where the density
change will be judged. Its buttons are hand-styled today.

## Problem

`GeneralInputs`, `PortfolioInputs`, `ExchangeAccountControls`, the `#results`
section and the three-way action row all render their buttons directly. The
action row in `+page.svelte` uses `grid-cols-[1fr_auto_1fr] items-center` —
three controls of presumably equal importance, laid out symmetrically, which is
a claim about their relative importance that may not be true.

`FEAT-0328` (`done`) compacted the account-controls row narrowly and shipped in
1.6.0-beta.195. Whatever it deliberately left alone, it left alone on purpose,
and this item should not undo that by accident.

## Proposal

Migrate the calculator and trade-panel buttons to the primitive, and re-check
the three-way action row's grouping and ordering against
[FEAT-0606](FEAT-0606-button-placement-visibility-and-dependency-audit.md)'s
findings.

Anything FEAT-0606 filed as a `BUG` is a separate fix and stays out of this
diff — a migration that also fixes behaviour makes the behaviour change
invisible in review.

## Acceptance criteria

- [ ] Every `<button>` in `GeneralInputs`, `PortfolioInputs`,
      `ExchangeAccountControls` and the results section renders through
      `Button.svelte` or carries a naming comment
- [ ] Button heights in the calculator come from the control-geometry tokens
- [ ] No `!important` is added by this item
- [ ] The three-way action row's ordering and grouping are either confirmed
      against FEAT-0606 and recorded, or a `BUG` is filed and the row is left
      as it is
- [ ] The calculator's existing component tests pass unmodified; if a test needs
      changing because a selector moved, that is recorded rather than silently
      rewritten
- [ ] `FEAT-0328`'s decisions are re-read before the diff, and any behaviour it
      established is preserved
- [ ] The calculator renders identically to `develop` at default settings

## Out of scope

- The calculation logic itself. Nothing here may change what a number is or how
      it is computed.
- `decimal.js` usage.
- The input fields. This item is buttons; inputs are FEAT-0609 and FEAT-0614.
- The window layout around the calculator.

## Open questions

- Does the three-way action row's symmetric layout reflect intent, or is it
  left over? FEAT-0606 is the item that answers this; this item should not
  guess.

## Links

- Evidence: [`assets/FEAT-0605/ui-zustandsaufnahme.md`](../assets/FEAT-0605/ui-zustandsaufnahme.md) §1 and §5
- [FEAT-0328](FEAT-0328-compact-account-controls-and-fee-display.md)
- [FEAT-0606](FEAT-0606-button-placement-visibility-and-dependency-audit.md)
- [FEAT-0610](FEAT-0610-extend-and-adopt-the-button-primitive.md)
