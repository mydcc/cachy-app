---
id: BUG-0784
title: No route error page and no component error boundary, so a render error blanks the whole UI
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
branch: fix/error-boundary
---

# BUG-0784 — Route error page and component error boundary (PA-12)

## Symptom

A render error from an unexpected API response tore down the whole component
tree; the global handler only showed a modal over a dead UI. There was no
`+error.svelte` and no `<svelte:boundary>`.

## Evidence

Derived — `src/routes/` had no `+error.svelte`; no `svelte:boundary` in
`src/**/*.svelte`. Production audit PA-12.

## Fix

- New `src/routes/+error.svelte` with the error message and a reload action.
- `<svelte:boundary>` around `WindowContainer` with an accessible fallback
  and a reload button.
- i18n keys added (en/de); `schema.d.ts` regenerated.

## Verification

`svelte-check` 0 errors; `eslint` clean; merged in #4500.
