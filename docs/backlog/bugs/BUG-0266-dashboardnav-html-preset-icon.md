---
id: BUG-0266
title: DashboardNav renders preset.icon through unsanitized {@html}
type: bug
status: done
branch: fix/bug-0266-sanitize-nav-icon
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-0266 — DashboardNav renders preset.icon through unsanitized {@html}

## Symptom

`src/components/shared/DashboardNav.svelte:74` renders the `preset.icon` prop via
`{@html}` without sanitization. Today both callers pass static icon constants or
nothing — there is **no live vector**. But the component contract accepts
arbitrary HTML, so the first future caller that passes user-defined icons
(imported backups are the obvious path, see [`BUG-0284`](BUG-0284-backup-restore-unvalidated-writes.md))
turns this into stored XSS.

## Evidence

**Derived** — from reading the component and its call sites; no exploit was built.
Hardening finding, filed to close the contract before it gets used.

## Fix

Sanitize inside the component via DOMPurify (as `Icon.svelte` does centrally), or
narrow the prop to an icon ID looked up from a fixed map. Prefer whichever
`Icon.svelte` already established.

## Acceptance criteria

- [ ] A component test passes `<img src=x onerror=...>` as `preset.icon` and
      asserts no executable markup survives rendering — failing before the fix
- [ ] Existing nav rendering is pixel/behaviour-identical for current callers

## Out of scope

Icon-authoring features (none exist). Other `{@html}` sites — audited clean.

## Links

- `src/components/shared/DashboardNav.svelte`, `src/components/shared/Icon.svelte`
- Security audit 2026-08-23, finding "unsanitized {@html preset.icon} component contract" (Low)

## What shipped

Shipped in 1.6.0-beta.137.
