---
id: FEAT-0613
title: Adopt the button primitive in the journal and the window frames
type: feature
status: done
priority: P2
milestone: none
created: "2026-10-03"
editions: [community, pro, private]
area: ui
parent: FEAT-0605
data_class: none
adr: none
depends_on: [FEAT-0610]
assignee: opencode
branch: feature/feat-0613-journal-frames
---

# FEAT-0613 — Adopt the button primitive in the journal and the window frames

The last adoption area: the journal, its tab strip, and the chrome every
window shares.

## Problem

`DashboardNav.svelte` (81 lines) is not the app navigation — it is the
journal's deep-dive preset strip (`performance | quality | direction |
discipline | costs`), rendered as `px-4 py-2 rounded-t-lg` with a `border-b-2`
active marker and icons injected through `{@html DOMPurify.sanitize(preset.icon)}`.
Its default presets are defined inline in the props with `|| "English"` label
fallbacks.

`WindowFrame.svelte` is 1373 lines and renders the minimise, maximise, close,
pin and context-menu controls that every window in the app carries. Those
controls are the most-repeated buttons in the codebase and the least
standardised.

Two notes. The `{@html}` icon path is a sanitisation boundary and must not
change in a styling item. And the window frame buttons must stay compatible
with whatever [FEAT-0616](FEAT-0616-add-magnetic-snapping-and-edge-tiling-for-windows.md)
adds — a snapping gesture is a pointer interaction on the same surface.

## Proposal

Migrate the journal's buttons and the window frame chrome to the primitive.

Where a frame control cannot be a normal button — because it must sit in a
drag handle, or must not intercept the drag gesture — record why, and keep it
as it is.

## Acceptance criteria

- [x] Every `<button>` in the journal tree renders through `Button.svelte` or
      carries a naming comment
- [x] `DashboardNav`'s preset strip renders through the tab-bar component
      decided in [FEAT-0607](FEAT-0607-harmonize-settings-vocabulary-placement-and-tabs.md),
      or states why a journal-local strip may differ — **states why**: FEAT-0607
      has not landed, and the strip's icon-plus-label with a border marker is
      journal-specific; it carries an escape comment naming FEAT-0607 as the
      owner of the shared tab bar
- [x] The `DOMPurify.sanitize` icon path is unchanged; the sanitisation test
      that covers it still passes (`DashboardNav.xss.component.test.ts`)
- [x] `DashboardNav`'s inline default-preset labels come from i18n; the
      `|| "English"` fallbacks are gone
- [x] `WindowFrame.svelte`'s chrome controls render through `Button.svelte`,
      except any that must not intercept a drag gesture — each such exception
      carries a comment saying so. **The drag exception did not apply**: the
      frame's `pointerdown` handler already ignores `.window-controls` and
      `.header-controls`, so no control intercepts the drag. The two remaining
      raw buttons are escaped for other reasons (selected state, menu
      semantics), each named in its comment
- [x] Every existing window implementation's test passes unmodified
- [x] `WindowFrame.svelte` is still under the project's file-size ceiling after
      this change, or the size is justified in the PR description — it is
      **1464 lines**, not under the ceiling; see the Progress note
- [x] Windows open, drag, maximise, minimise, pin and close with no
      behavioural change

## Progress — 2026-10-22

Branch `feature/feat-0613-journal-frames`. 38 controls migrated (27 journal,
11 window chrome), 15 escaped with a `FEAT-0613 escape:` comment.

**Primitive additions**

- `size="xs"` at a new `--control-height-xs: 24px`. The chrome controls were
  20–24 px; the smallest existing size (34 px) would have grown every window's
  title bar by 10 px. 24 px meets the WCAG 2.5.8 minimum target height, and
  `.btn-xs` also carries `min-width: var(--control-height-xs)` so the width
  does too (the 20 px tool buttons met neither).
- `ondblclick` passthrough. The chrome buttons sit inside the drag handle and
  swallow the header's double-click-to-maximise themselves; without the prop
  the migration would have dropped that.

**Migrated**

| Surface | Controls | Variant / size |
| --- | --- | --- |
| `JournalContent` | sync history; column-settings Done; 4 column presets; export / import / clear | `outline sm`; `accent xs`; `outline xs`; `success` / `accent` / `danger` sm |
| `JournalFilters` | table settings; 7 quick-date buttons | `outline sm`; `outline xs` |
| `JournalTable` | group toggle; 3 row actions; 2 pagination; lightbox close | `ghost-muted xs`; `outline xs`; `outline xs`; `ghost-muted xs` |
| `TradeDetailDrawer` | close; save notes | `ghost-muted xs`; `accent xs` |
| `JournalEntryTags` | remove tag | **escaped** — a 10px glyph inside a tag pill; `xs` would grow the pill from ~16 to 28 px (review) |
| `WindowFrame` | zoom ×2, export, delete, open-in-tab, font ± , duck, minimise, maximise, close | `ghost-muted xs` |

**Escaped** — journal tab strip (3), segmented trade-mode control (3),
screenshot thumbnails (2), full-area image trigger (1), overlay close (1),
left-aligned suggestion row (1), year pill (1), deep-dive tab strip (1),
window header control with a selected state (1), context-menu item (1).

**Dead CSS removed** — `.tool-btn`, `.close-btn` (window frame), `.settings-btn`,
`.quick-date-btn` (except its `flex: 0 0 auto` / `no-wrap`, which the primitive
does not provide), `.group-toggle-btn`, `.action-icon-btn`, `.pagination-btn`.
The pre-migration Tailwind strings came along as `extraClasses`; the review
removed the declarations the primitive already wins (padding, radius, font
size, colours), leaving only layout that still applies (`gap`, `ml-2`,
`opacity`). The reset chip uses `outline-accent` and the row delete
`ghost-danger`, because their inline colour classes were inert there. `svelte-check` reports 0 errors and the same 6 baseline warnings.

**Normalization, stated**

- Journal buttons carried 11–12 px labels; `.btn-base` is 14 px/700, so every
  migrated journal control grows to 14 px. This is the largest visible delta.
- The title bar grows by **2 px** (4 px on windows without an icon): the
  `.control-group` wrapper is 20 + 2·2 + 2·1 = 26 px around a 20 px tool button
  and 30 px around a 24 px one. `.window-header` has no fixed height, so its
  content box follows. The tool buttons lose their subtle hover background;
  hover is now the accent colour (close included — it used to tint red).
  `WINDOW_HEADER_HEIGHT = 44` was already an estimate, not the rendered box.
- The journal toolbar's export / import / clear buttons were **text-only** on
  `develop`: `.btn-success` / `.btn-accent` / `.btn-danger` had no rule without
  `.btn-base`, so the tokens the author wrote did nothing. This item gives them
  the fills they were written for (green / accent / red). The sync button and
  the column presets grow one size step as well.
- The grouped-row toggle grows from a ~14 px inline glyph to a 24 px control, so
  group header rows gain a little height on the symbol cell.
- Quick-date chips move from `--bg-secondary` + `--text-secondary` to the
  outline pair (`--bg-tertiary` + `--text-primary`).
- `.action-icon-btn` had `--bg-secondary`; `outline` is `--bg-tertiary`.

**WindowFrame size.** 1464 lines after the change (it was 1501 before; the dead
CSS removal more than offsets the Button markup). Still over the 800-line soft
ceiling. Splitting the chrome out is a refactor that belongs with FEAT-0615
(window flags) or FEAT-0616 (snapping), not with a styling migration; doing it
here would make the behavioural diff unreadable.

**AC6.** `WindowFrame.component.test.ts` passes unmodified, including the
BUG-0710 header-control cases and the FEAT-0685 text-size cases; the journal
suites and `DashboardNav.xss.component.test.ts` pass unmodified too.

Audit §5 re-counted: **258** raw `<button>` across 89 files (368 before
FEAT-0610; 296 after FEAT-0612).

## Out of scope

- Adding snapping, tiling or any new window control. That is FEAT-0616.
- Consolidating the window flags, which is
      [FEAT-0615](FEAT-0615-consolidate-window-flags-and-resolve-the-double-click-drift.md).
- Changing the icon set or the sanitiser.
- Migrating buttons in the SEO pages.

## Open questions

- `WindowFrame.svelte` at 1373 lines is the largest single UI file in the
  repository. Splitting the chrome out of it is a refactor nobody has asked
  for. Should this item do it, or file it separately?

## Links

- Evidence: [`assets/FEAT-0605/ui-zustandsaufnahme.md`](../assets/FEAT-0605/ui-zustandsaufnahme.md) §2 and §5.1
- `src/components/shared/windows/WindowFrame.svelte`
- `src/components/shared/DashboardNav.svelte`
- [FEAT-0610](FEAT-0610-extend-and-adopt-the-button-primitive.md)
- [FEAT-0615](FEAT-0615-consolidate-window-flags-and-resolve-the-double-click-drift.md)
- [FEAT-0616](FEAT-0616-add-magnetic-snapping-and-edge-tiling-for-windows.md)
