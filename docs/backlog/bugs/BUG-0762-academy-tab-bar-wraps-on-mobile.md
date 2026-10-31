---
id: BUG-0762
title: Academy tab bar wraps long labels on narrow containers
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: fix/bug-0762-academy-tab-single-line
---

# BUG-0762 — Academy tab bar wraps long labels on narrow containers

## Symptom

In a narrow Academy window (phone, small floating window) the four tab labels
break into two or three lines each and stack over three rows. The header eats
several hundred pixels before the first lesson is visible, and the active tab
("MARKTSTRUKTUR & REGIME") sits alone on its own row. Observed in the Academy
window at ~480px width (screenshots, 2026-10-31).

## Evidence

**Demonstrated** — observed by the user in the Academy window on a narrow
screen; screenshots attached to the session (2026-10-31).

Cause is visible in the code, `src/components/shared/AcademyTabs.svelte`:
the `tablist` carries `flex-wrap`, and every tab button carries
`min-w-[140px]`. Four labels of 20–27 uppercase characters cannot fit
`min-w-[140px]` boxes into a narrow container, so `flex-wrap` moves them onto
new rows instead of scrolling.

## Cause

`flex flex-wrap` on the tablist plus a hard `min-w-[140px]` floor per button:
wrap is chosen over horizontal scroll, and the long labels are never shortened
for narrow containers.

## Fix

- Tablist: no wrapping, single line with `overflow-x-auto`.
- Buttons: `shrink-0` + `whitespace-nowrap` (no 140px floor); `grow` so wide
  containers keep the even distribution.
- Labels: container-query switch — short form below the `@4xl` container step,
  full form above. Short labels are substrings of the full labels so the
  accessible name (always the full label via `aria-label`) contains the
  visible text (WCAG 2.5.3).
- New i18n keys `*.shortTitle` in DE and EN; `npm run i18n:types` regenerates
  `src/locales/schema.d.ts`.

## Acceptance criteria

- [x] A component test pins the single-line contract: no `flex-wrap`, no
      `min-w-[140px]`, `overflow-x-auto` + `whitespace-nowrap` present.
- [x] The same test pins the label switch: short label rendered in DOM, full
      label present for wide containers, `aria-label` carries the full label.
- [x] `*.shortTitle` exists in DE and EN; `schema.d.ts` regenerated.
- [x] Existing tab tests keep passing; tab helpers find tabs by their
      accessible name, not by concatenated text content.

## Out of scope

- The rest of the Academy layout (structure-tab cockpit) — separate items.
- Renaming the full labels.
- Tab reordering or iconography.

## Links

- `src/components/shared/AcademyTabs.svelte` — the tab bar
- FEAT-0679, FEAT-0686 — the Academy tab shell this belongs to
- BUG-0047 — earlier Academy mobile usability defect
