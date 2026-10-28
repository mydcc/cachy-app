---
id: FEAT-0756
title: Show why an indicator alert action refuses
type: feature
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
parent: FEAT-0623
depends_on: []
size: S
estimate: 2
---

# FEAT-0756 — Show why an indicator alert action refuses

## Problem

An indicator card whose setting cannot be expressed as an alert keeps its bell
button, dims it to 45 % opacity, and puts the reason in `title` and
`aria-label`. A screen reader hears the reason; a sighted trader sees a greyed
bell and nothing else. `title` appears on hover only, after a delay, and never
on keyboard focus.

The refusal is one of three, and each names the setting that has to change
(source, ADX length, Ichimoku displacement). A trader who cannot read it has no
way to know that the card is one setting away from being alertable.

## Evidence

- `src/components/settings/tabs/IndicatorAlertAction.svelte:118` records the
  escape: the shared button primitive is not used because it cannot carry the
  refused styling and the 24 px size.
- `:160-168` — `.refused` sets `opacity: 0.45` and `cursor: not-allowed`; the
  label exists only in `title`/`aria-label` (`:124-125`).
- The reason strings already exist and are specific
  (`settings.technicals.alertSourceMismatch`,
  `alertAdxLengthMismatch`, `alertIchimokuDisplacementMismatch`).

## Proposal

Keep the button where it is and make the refusal legible:

1. A small popover or inline text that appears on hover **and** on keyboard
   focus, carrying the same string the accessible name uses.
2. A refused affordance that meets non-text contrast (the icon at full contrast,
   the refusal expressed by a border or slash rather than opacity alone), so the
   control is visible against the card at 45 % and at 100 %.
3. No layout shift when it appears; it may overlay the card edge the way the
   existing tooltips do.
4. The button stays in the tab order and keeps `aria-disabled` rather than
   `disabled`, so the reason remains reachable.

## Acceptance criteria

- [ ] Hovering a refused action shows the exact reason string.
- [ ] Focusing it by keyboard shows the same string, and the element is
      reachable in tab order.
- [ ] The refused control meets WCAG 2.2 non-text contrast (≥ 3:1) against the
      card in both themes.
- [ ] The reason is the same string as the accessible name — one source, not
      two copies.
- [ ] No layout shift on reveal; both locales resolve the strings.
- [ ] An alertable card is unchanged: same button, same behaviour, no popover.

## Out of scope

- Reworking the shared button primitive — FEAT-0611.
- Making every refusal alertable; the core's condition set is unchanged.
- The indicator card layout.

## Open questions

- Popover or inline text? Proposal: popover on focus/hover, because the card is
  dense and inline text would reflow the settings grid.

## Links

- `src/components/settings/tabs/IndicatorAlertAction.svelte`
- [`FEAT-0611`](../features/FEAT-0611-adopt-the-button-primitive-in-the-settings-tabs.md)
- [`FEAT-0389`](../features/FEAT-0389-super-alert-panel.md)
- [`FEAT-0623`](../features/FEAT-0623-audit-super-alert-system-gaps-and-design.md)
