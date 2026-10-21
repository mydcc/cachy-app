---
id: FEAT-0609
title: Introduce control-geometry and density tokens
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
depends_on: [FEAT-0605]
assignee: opencode
branch: feature/feat-0609-control-geometry-tokens
---

# FEAT-0609 — Introduce control-geometry and density tokens

Every control size in the app is a literal. This item turns control geometry
into tokens, so that a later item can change it by changing a value.

## Problem

`.input-field` in `src/themes.css` carries `height: 42px; max-height: 42px;`.
Next to it, `.input-field-sm` carries `height: 34px !important` — an override
someone added where a smaller control was needed, which has since become a
de facto third size. `.settings-number-input` is `width: 70px`. The
`+page.svelte` preset `<select>` combines `.input-field` with `px-3 py-2`,
which is a vertical padding on a class that already fixes its height.

The token set has `--space-1..8`, `--radius-sm/md/lg/xl/full` and
`--text-xs..2xl`. Spacing and colour were designed for. Control geometry was
not, and the result is that "how tall is an input" has three answers depending
on which stylesheet wins.

This is the root cause behind the proposed 42 → 32 px change. Without this item,
that change is a search-and-replace across 110 hardcoded pixel dimensions in
`.svelte` files, and it will miss every site that pads instead of sizing.

## Proposal

Add a control-geometry token layer alongside the existing spacing and radius
tokens, and route the control classes through it.

The token values in this item equal today's values. The diff must be visually a
no-op; its only observable effect is that a control height now has one source.
Making it 32 px is [FEAT-0614](FEAT-0614-introduce-compact-default-and-wide-density-modes.md)
and belongs there.

Scope the tokens to what controls actually need: height, horizontal padding,
font size, and the radius that keeps a control's corner proportional to its
height.

## Acceptance criteria

- [x] A control-geometry token set exists in `src/themes.css` covering control
      height, control horizontal padding and control font size
- [x] Every theme block overrides the token set or inherits it deliberately —
      no theme silently re-introduces a literal
- [x] `.input-field` uses the token; no `height` or `max-height` literal remains
      in it
- [x] `.input-field-sm` is either removed or redefined as "one step smaller" in
      tokens, and its `!important` declarations are gone
- [x] `.settings-number-input` takes its width and padding from tokens
- [x] The `+page.svelte` preset `<select>` no longer applies vertical padding on
      top of a height-fixed field
- [x] The 110 hardcoded pixel dimensions in `.svelte` files are enumerated by
      category in the PR description; the control-related ones are converted,
      the decorative ones are listed for later
- [x] A test asserts `.input-field`'s computed height equals the token's value,
      so a later change to the token is visible in the DOM rather than only in
      the stylesheet
- [x] The rendered result is pixel-identical to `develop` at the default settings

## Out of scope

- Changing any token's value. This item makes the values changeable; it does
  not change them.
- The `compact` / `wide` modes.
- `--space-*` — it exists and is used.
- Font scale and general typography, which are a different concern from control
  geometry and belong with the density mode if they are wanted at all.

## Open questions

- Does `min-h-[Npx]` on non-control elements (spacers, chart wrappers) belong
  in this token set, or stay as literals? Converting them risks conflating
  layout with control geometry.

## Links

- Evidence: [`assets/FEAT-0605/ui-zustandsaufnahme.md`](../assets/FEAT-0605/ui-zustandsaufnahme.md) §4 and §6 (C1, C4)
- `src/themes.css` (3223 lines)
- [FEAT-0605](FEAT-0605-ui-status-quo-audit.md)
- [FEAT-0610](FEAT-0610-extend-and-adopt-the-button-primitive.md) — consumes these
- [FEAT-0614](FEAT-0614-introduce-compact-default-and-wide-density-modes.md) — the consumer
- [FEAT-0617](FEAT-0617-turn-sidebar-width-into-a-token-and-allow-resizing.md)

## Progress — 2026-10-21

Branch `feature/feat-0609-control-geometry-tokens`, based on `c29f46ab8`.

### Tokens

`src/themes.css` gains one control-geometry block in `:root, .theme-default`:
`--control-height: 42px`, `--control-height-sm: 34px`,
`--control-padding-x: var(--space-3)`, `--control-font-size: 1rem`,
`--control-font-size-sm: 0.75rem`, `--control-radius: var(--radius-md)`,
`--control-number-width: 70px`, `--control-number-padding-x/y`.

The values equal the shipped ones — the diff is a visual no-op by value. The
shipped themes inherit the block: custom properties inherit from `:root`, and no
`.theme-*` block declares a control token. `themes.controlTokens.test.ts` pins
that (one `--control-height` declaration, no `--control-` in another theme block);
a theme that wants different geometry must override these tokens, which fails
that guard until the deliberate exception is recorded there.

`--control-font-size` is a reference value, not applied to `.input-field`:
adding `font-size: var(--control-font-size)` there would not be a no-op, because
the unlayered rule would outrank the `text-sm` / `text-xs` utilities that
several controls use today. FEAT-0614 can apply it when it changes the mode.

### Classes

- `.input-field`: `height`/`max-height` from `--control-height`, padding from
  `--control-padding-x`, radius from `--control-radius`. No height literal.
- `.input-field-sm`: redefined as `--control-height-sm` + `--control-font-size-sm`
  and selected as `.input-field.input-field-sm`. Both `!important`
  declarations are gone; the two-class selector outranks `textarea.input-field`
  (0,2,0 vs 0,1,1), which a bare `.input-field-sm` would lose against.
- `.settings-number-input`: width and padding from the number tokens.
- `#preset-loader`: `px-3 py-2` removed. They were already dead — `.input-field`
  is unlayered and sets `padding: 0 var(--control-padding-x)`, so the utilities
  never applied — but they read as a second source.

### Control sites in `.svelte` (AC7)

Measured on `c29f46ab8` with the audit's four patterns (`h-[Npx]`,
`min-h-[Npx]`, `w-[Npx]`, inline `height: Npx`): **78** sites, against the
audit's **110** at the FEAT-0605 baseline `d853139c6` — the codebase drifted,
like the button count did (364 → 368). The wider width/height family
(`max-h-`, `min-w-`, `max-w-`, inline `width`/`min-height`/…) adds **91** more.

Converted (5 declarations):
`TagInputs.svelte` (h + min-h 42), `TimeframeSelector.svelte` (min-h 42),
`JournalFilters.svelte` settings button (w/h 34, square icon button).

Listed for later, not converted:
- **Button primitive (FEAT-0610)**: `PlaceOrderPanel` submit 48 px,
  `GeneralInputs` trade-type switch 56 px, toggle tracks 12/36 px
  (`Toggle`, `TradeSetupInputs`), 36 px icon squares (`PowerToggle`,
  `LeftControlPanel`).
- **Decorative/layout**: chart tiles 200/250/300 px (`JournalCharts`,
  `JournalDeepDive`, chart components), scroll areas 260/300/500 px
  (`SymbolPickerView`, `CandleChartView`, list panels), textareas 90/160 px,
  window chrome 34 px (`WindowFrame` minimized), and the misc spacing family.

### Test

`src/themes.controlTokens.test.ts` (6 cases) injects `themes.css`, reads
`--control-height` from the document and asserts `.input-field`'s **computed**
height/max-height equal it, plus padding 12 px, radius 6 px. It then overrides
the token at runtime and asserts the rendered control follows to 32 px — the
proof that the DOM reads the token rather than agreeing with a literal.
`.input-field-sm` computes 34 px / 12 px with no `!important` in its rule;
`.settings-number-input` computes 70 px wide with 4/8 px padding. A source guard
keeps the three converted `.svelte` sites on the token (Tailwind utilities cannot
be computed without the compiled sheet, so revert protection there is textual).
RED proof: removing `var(--control-height)` in favour of a literal fails the
rule assertion, re-adding `!important` fails the small-rule assertion, and
reverting a `.svelte` site to `42px` / `34px` fails the source guard.

### No-op argument

Every converted declaration resolves to the same value as before
(42/34/70/12/8/4/6 px), the removed preset utilities were already overridden by
the unlayered `.input-field` rule, and no other selector changes. This is
established by value and cascade analysis, not by a screenshot diff; the test
pins the resolved values and the token wiring.
