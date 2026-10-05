---
id: FEAT-0614
title: Introduce compact, default and wide density modes
type: feature
status: specced
priority: P2
milestone: none
created: "2026-10-03"
editions: [community, pro, private]
area: ui
parent: FEAT-0605
data_class: none
adr: none
depends_on: [FEAT-0607, FEAT-0609, FEAT-0610, FEAT-0611, FEAT-0612, FEAT-0613]
---

# FEAT-0614 — Introduce compact, default and wide density modes

The reason the rest of this track exists. Inputs are 42 px tall; the question
this item answers is whether 32 px makes Cachy better or worse, and it answers
it with a user-facing control rather than a one-off experiment.

## Problem

`.input-field` is fixed at 42 px. There is no density setting. A user on a
laptop with a long result list and many position rows has no way to fit more of
them on screen.

Height is only the visible part of density. Font size, section padding and gap
have to move together, or the result reads as "someone shrank the inputs"
rather than "this fits more rows". A mode that changes one value produces a
cramped UI, not a dense one.

## Proposal

Add a `density` setting with three values — `compact`, `default`, `wide` —
selectable from a dropdown in the settings window, backed by a token set per
mode.

Each mode is a set of token overrides, not a single value. `compact` lowers
control height, control font size, section padding and gap together.
`default` is the current rendering, unchanged, and is what existing users get
without touching anything. `wide` is the current rendering with more generous
values, so the control is not a two-position switch with an unloved third
option.

Three implementation constraints, all from the audit:

- The setting must register in `src/stores/settings/migrations.ts`. The store
  costs six touchpoints per flag (default, `$state`, load, save, getter), and
  the mode must not be the seventh ad-hoc boolean.
- The dropdown's placement is decided in
  [FEAT-0607](FEAT-0607-harmonize-settings-vocabulary-placement-and-tabs.md), not
  here.
- The mode has to reach controls that currently pad instead of sizing, which
  is what [FEAT-0609](FEAT-0609-introduce-control-and-density-tokens.md) and
  the three adoption items exist for.

## Acceptance criteria

- [ ] `default` renders pixel-identically to `develop`; a screenshot baseline
      proves it, per the open question below
- [ ] `compact` and `wide` each change control height, control font size,
      section padding and section gap together
- [ ] The density setting persists across a reload, and restores as `default`
      for users who have never chosen
- [ ] The setting registers in `src/stores/settings/migrations.ts` and has a
      test proving a stored value with no density key loads as `default`
- [ ] The dropdown has a label and keyboard-reachable options; it uses the
      primitive's control size so it does not become a third input height
- [ ] Switching modes changes no computed value, no trade result, and no
      exchange request — a test asserts the calculator's outputs are identical
      across all three modes
- [ ] A test asserts `.input-field`'s computed height in `compact` equals the
      compact token, and in `wide` the wide token
- [ ] Both `de.json` and `en.json` carry the dropdown's label and the three
      option labels
- [ ] The mobile policy from the open questions is implemented, or explicitly
      deferred with the decision recorded in this item

## Out of scope

- Introducing the tokens. That is
      [FEAT-0609](FEAT-0609-introduce-control-and-density-tokens.md); this item
      only selects between them.
- Adopting the button primitive, which is FEAT-0611 through FEAT-0613.
- A font-scale setting. Density is one control; adding a second independent
      typography knob recreates the problem this track exists to remove.
- Per-area density. One setting, one mode, app-wide.
- Reducing anything below the WCAG 2.2 SC 2.5.8 minimum target size.

## Open questions

- **Mobile.** 32 px clears SC 2.5.8 (24 × 24 minimum) but is well under SC
  2.5.5 (44 × 44). On a touch-primary device compact inputs are hostile, and
  `+page.svelte` already has a separate mobile branch. Three candidates: apply
  the mode everywhere; clamp `compact` to pointer-fine viewports; or let the
  user choose and accept the consequence. This blocks `ready`.
- **Does it actually look better?** The premise is untested. A screenshot
      baseline of the calculator, settings and journal at all three modes is the
      cheapest way to find out before the rollout items are written, and it is
      the answer to the question this item was created for.
- Should the mode survive a future theme change, or be reset when the theme
  changes? Themes override token families individually today.

## Links

- Evidence: [`assets/FEAT-0605/ui-zustandsaufnahme.md`](../assets/FEAT-0605/ui-zustandsaufnahme.md) §4 and §7 (N1, N2)
- [FEAT-0607](FEAT-0607-harmonize-settings-vocabulary-placement-and-tabs.md) — placement
- [FEAT-0609](FEAT-0609-introduce-control-and-density-tokens.md) — the tokens
- [FEAT-0610](FEAT-0610-extend-and-adopt-the-button-primitive.md)
- [FEAT-0611](FEAT-0611-adopt-the-button-primitive-in-the-settings-tabs.md)
- [FEAT-0612](FEAT-0612-adopt-the-button-primitive-in-the-calculator-and-trade-panel.md)
- [FEAT-0613](FEAT-0613-adopt-the-button-primitive-in-journal-and-window-frames.md)
