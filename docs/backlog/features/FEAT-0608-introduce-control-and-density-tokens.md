---
id: FEAT-0608
title: Introduce control-geometry and density tokens
type: feature
status: ready
priority: P2
milestone: none
created: "2026-10-03"
editions: [community, pro, private]
area: ui
parent: FEAT-0604
data_class: none
adr: none
depends_on: [FEAT-0604]
---

# FEAT-0608 — Introduce control-geometry and density tokens

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
Making it 32 px is [FEAT-0613](FEAT-0613-introduce-compact-default-and-wide-density-modes.md)
and belongs there.

Scope the tokens to what controls actually need: height, horizontal padding,
font size, and the radius that keeps a control's corner proportional to its
height.

## Acceptance criteria

- [ ] A control-geometry token set exists in `src/themes.css` covering control
      height, control horizontal padding and control font size
- [ ] Every theme block overrides the token set or inherits it deliberately —
      no theme silently re-introduces a literal
- [ ] `.input-field` uses the token; no `height` or `max-height` literal remains
      in it
- [ ] `.input-field-sm` is either removed or redefined as "one step smaller" in
      tokens, and its `!important` declarations are gone
- [ ] `.settings-number-input` takes its width and padding from tokens
- [ ] The `+page.svelte` preset `<select>` no longer applies vertical padding on
      top of a height-fixed field
- [ ] The 110 hardcoded pixel dimensions in `.svelte` files are enumerated by
      category in the PR description; the control-related ones are converted,
      the decorative ones are listed for later
- [ ] A test asserts `.input-field`'s computed height equals the token's value,
      so a later change to the token is visible in the DOM rather than only in
      the stylesheet
- [ ] The rendered result is pixel-identical to `develop` at the default settings

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

- Evidence: [`assets/FEAT-0604/ui-zustandsaufnahme.md`](../assets/FEAT-0604/ui-zustandsaufnahme.md) §4 and §6 (C1, C4)
- `src/themes.css` (3223 lines)
- [FEAT-0604](FEAT-0604-ui-status-quo-audit.md)
- [FEAT-0609](FEAT-0609-extend-and-adopt-the-button-primitive.md) — consumes these
- [FEAT-0613](FEAT-0613-introduce-compact-default-and-wide-density-modes.md) — the consumer
- [FEAT-0616](FEAT-0616-turn-sidebar-width-into-a-token-and-allow-resizing.md)
