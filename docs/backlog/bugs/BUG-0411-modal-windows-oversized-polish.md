---
id: BUG-0411
title: Modal windows are oversized with large empty areas
type: bug
status: in-progress
assignee: opencode
priority: P0
milestone: M4
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-0411 — Modal windows are oversized with large empty areas

## Symptom

Dialog windows render far larger than their content, leaving most of the
surface empty and dark. Observed live (Sep 2026, reporter screenshots):

1. **Margin & position mode** (`MarginModeModal` via `ExchangeAccountControls`):
   window fills a large area while the content (two option sections plus
   Cancel/Confirm) occupies only the top-left portion. The options
   themselves render correctly — Cross vs Isolated with pool diagrams,
   One-way vs Hedge with trade diagrams, active pick highlighted.
2. **Adjust leverage** (`LeverageModal`): same picture — a note line, the
   value stepper, the 1x–200x slider and Cancel/Confirm sit at the top of
   a mostly empty dialog.

The request is a review and polish pass over **all** modal windows, not
just these two: consistent, content-sized dialogs across the app.

## Reproduction

1. Trade panel → click the `Cross • Hedge` mode chip.
2. The "Margin & position mode" dialog opens oversized with large empty
   areas around/below the content.
3. Close it, open the `10x` leverage chip → "Adjust leverage" shows the
   same oversized, mostly empty dialog.

## Cause

Not yet identified — needs a look at dialog sizing (window defaults vs
content measurement) in the shared window stack (`src/lib/windows/`) and
the two dialog components. Suspected shared cause rather than two local
ones, since unrelated dialogs show the identical oversized frame. See
`DialogWindow.svelte.ts` size-override precedent (BUG-0010) for how
dialog sizing was repaired before.

## Expected

- Every modal dialog sizes to its content (plus intended padding), with
  no large empty regions, on desktop and mobile widths.
- Consistent dialog widths/padding across all modals (one rule, not
  per-dialog pixel tweaks).
- Acceptance: open each modal (mode, leverage, and the rest inventoried
  during the fix) and compare against the content-sized expectation;
  screenshots before/after in the PR.
- Out of scope: any behavior change (picks, confirms, writes, reads —
  BUG-0409/BUG-0410 own those), new settings, new dialogs.

## Notes

Pure UI polish, no money path: P3. The mode dialog's content itself
(options, diagrams, active states, Cancel/Confirm) was verified visually
correct by the reporter — only the frame is wrong.

Reporter remark (design input for the fix, Sep 2026 screenshot): the
broker groups Margin Mode, Contract Unit, Asset Mode and Position Mode
as tabs inside one "Configs" dialog, which reads far clearer than
Cachy's separate chips and dialogs. The polish pass should evaluate one
tabbed account-settings dialog (margin / position / leverage) instead
of only shrinking the existing separate frames — same behavior, shared
frame, less hunting.

Reporter UX verdict (Sep 2026): a second confirm dialog on top of the
modal's own Confirm is nonsense — one action, one confirmation. The
toggle exists (`margin-mode-change`), but the default double-confirm
should be reconsidered, not just resized.

## Links

- [`BUG-0409`](./BUG-0409-mode-chip-stale-after-change.md) — same control, data half
- [`BUG-0410`](./BUG-0410-mode-state-must-not-depend-on-sidebar.md) — same control, source half
