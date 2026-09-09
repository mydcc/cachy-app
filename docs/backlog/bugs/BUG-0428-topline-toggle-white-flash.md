---
id: BUG-0428
title: Toggling Sentiment Topline flashes its region white briefly
type: bug
status: specced
priority: P0
milestone: M4
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-0428 — Toggling Sentiment Topline flashes its region white briefly

## Symptom

Reporter-tested 2026-09-09: toggling Sentiment Topline off flashes white
briefly, confined to the topline's render area. Same pattern as BUG-0414,
which reporter-verified as fixed by removing `forceContextLoss()`.

## Cause

`AmbientTopline.svelte` calls `renderer.forceContextLoss()` in its
`onMount` cleanup — the same call removed in BUG-0414 (precedent `0f2ff27`).

## Fix

Remove the call; `dispose()` stays.

## Acceptance criteria

- [ ] No white flash on ~20 topline on/off toggles (Brave/Dark/Default)
- [ ] No GL errors in console; overlay still renders when re-enabled

## Out of scope

- Burning Borders (BUG-0414, fixed in #2808)
