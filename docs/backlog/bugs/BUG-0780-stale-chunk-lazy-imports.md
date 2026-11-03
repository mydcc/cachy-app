---
id: BUG-0780
title: Stale-chunk recovery never fires for failed lazy imports
type: bug
status: in-progress
priority: P1
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: fix/stale-chunk-recovery
---

# BUG-0780 — Stale-chunk recovery never fires for failed lazy imports

## Symptom

After a deployment, a tab that stayed open can no longer open the market
dashboard, alerts, auto-backup restore, the order tooltip or any of the visual
overlays. The failure is printed to the console once and the button keeps
doing nothing until the tab is reloaded by hand. The stale-deployment recovery
that exists for exactly this case never runs.

## Evidence

**Derived, with a source-level test in the fix.**

- `src/routes/+layout.svelte` had seven lazy imports ending in
  `.catch((err) => console.error("Failed to load …", err))`.
- `src/hooks.client.ts:43-44` installs `installStaleDeploymentRecovery()`,
  which listens for `unhandledrejection` and calls `scheduleStaleReload()`.
- The `.catch` handlers swallow the rejection before it can become an
  `unhandledrejection`, so `isStaleChunkError` is never consulted for these
  imports.

## Cause

The lazy imports were written with a local `console.error` before the
stale-deployment recovery existed. Routing the rejection to the global handler
was never wired up.

## Fix

- Add `handleLazyLoadFailure(label, error)` to
  `src/lib/staleDeploymentRecovery.ts`: stale chunk → `scheduleStaleReload()`,
  anything else → `console.error`, with both callbacks injectable for tests.
- Route all seven lazy-import catches in `+layout.svelte` through it.
- Pin the decision in the recovery unit test and the wiring with a source
  assertion that no catch logs directly and all seven call the handler.

## Acceptance criteria

- [x] A stale chunk error from any lazy import schedules exactly one reload.
- [x] A non-chunk failure is logged and does not reload.
- [x] All seven lazy-import catches in `+layout.svelte` use the handler.
- [x] The recovery unit tests and the layout wiring test are green.

## Out of scope

- The recovery handler's own one-shot guard and `sessionStorage` flag
  (`installStaleDeploymentRecovery`), which already work.
- Lazy imports outside `+layout.svelte`.

## Links

- Audit: `~/.local/state/cachy-audit/2026-11-03/w3-production.md` (PA-02)
- `src/lib/staleDeploymentRecovery.ts` — recovery module
