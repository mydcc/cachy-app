---
id: BUG-0712
title: Window zoom and font-size controls stay enabled at their limits
type: bug
status: specced
priority: P2
milestone: none
created: "2026-10-21"
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-0712 — Window zoom and font-size controls stay enabled at their limits

## Symptom

A window at 50 % or 200 % zoom still shows an enabled `−` / `+`. The same holds
for `A-` / `A+` at the 8 px and 32 px font bounds. Pressing the control does
nothing, and nothing in the header says the limit was reached.

## Evidence

**Derived.** The clamping and the missing guard are both in the code:

- `src/lib/windows/WindowBase.svelte.ts:778` —
  `zoomIn() { … Math.min(this.zoomLevel + 0.1, 2.0) }`
- `src/lib/windows/WindowBase.svelte.ts:780` —
  `zoomOut() { … Math.max(this.zoomLevel - 0.1, 0.5) }`
- `src/lib/windows/WindowBase.svelte.ts:784` —
  `setFontSize(size) { … Math.min(Math.max(size, 8), 32) }`
- `src/components/shared/windows/WindowFrame.svelte:750`, `:760`, `:844`, `:851`
  — the four buttons render with no `disabled` attribute at all.

The zoom percentage is displayed between the two zoom buttons, so the value is
visible; the font size is not displayed anywhere.

## Cause

The clamp lives in the action, not in the control's enablement. The header was
built before the bounds existed and never learned about them.

## Fix

Disable the button whose direction is exhausted (`zoomLevel <= 0.5` /
`>= 2.0`, `fontSize <= 8` / `>= 32`) and give the disabled state a reason the
way `IndicatorAlertAction` does it: keep it in the tab order with
`aria-disabled` plus a `title`, rather than a native `disabled` that drops focus.

Leave the clamping in `WindowBase` in place — the guard is a UI affordance, not
the safety boundary.

## Acceptance criteria

- [ ] A test drives a window to each bound and asserts the matching control is
      marked unavailable (and the opposite one is not)
- [ ] The control stays keyboard-reachable and its reason is announced
- [ ] Reverting the guard turns the test red

## Links

- Found by [FEAT-0606](../features/FEAT-0606-button-placement-visibility-and-dependency-audit.md)
- Evidence table: [`ui-zustandsaufnahme.md`](../assets/FEAT-0605/ui-zustandsaufnahme.md) §8.3
