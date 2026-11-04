---
id: BUG-0780
title: Stale-chunk recovery never fires for failed lazy imports
type: bug
status: done
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
- `src/hooks.client.ts` installs `installStaleDeploymentRecovery()` at module
  load; its `handleError` hook also routes render errors to
  `scheduleStaleReload()`.
- The `.catch` handlers swallow the rejection before it can become an
  `unhandledrejection`, so `isStaleChunkError` is never consulted for these
  imports.

## Cause

The lazy imports were written with a local `console.error` before the
stale-deployment recovery existed. Routing the rejection to the global handler
was never wired up.

## Fix

- Add `handleLazyLoadFailure(label, error)` to
  `src/lib/staleDeploymentRecovery.ts`: a stale chunk takes the guarded reload
  path, anything else is logged; both callbacks are injectable for tests.
- Reset the one-shot guard when `location.reload()` throws, so a blocked
  navigation does not leave the tab permanently unrecoverable.
- Route all seven lazy-import catches in `+layout.svelte` through it.
- Pin the decision in the recovery unit test (including the production
  default and the blocked-reload path) and the wiring with a source guard that
  requires every lazy-import `.catch` to call the handler and forbids a direct
  log.

## Acceptance criteria

- [x] A stale chunk error from any lazy import triggers at most one guarded
      reload per tab session.
- [x] A blocked `location.reload()` re-arms the guard and is logged, instead
      of silently disarming recovery.
- [x] A non-chunk failure is logged and does not reload.
- [x] All seven lazy-import catches in `+layout.svelte` use the handler; none
      logs directly.
- [x] The recovery unit tests and the layout wiring test are green.

## Out of scope

- The one-reload-per-tab rule itself: the `sessionStorage` flag is never
  cleared, so a second deployment in the same long-lived tab is not
  recovered. That is the loop guard, not a regression; changing it needs a
  separate decision (e.g. namespacing the flag by build id).
- Lazy imports outside `+layout.svelte`: `BackgroundRenderer.svelte` (two)
  and `chartSetup.ts` (one) still log a failed import directly. Same class,
  separate follow-up.
- A user-facing message for non-stale lazy-import failures. They are logged
  and retried only when the trigger fires again; the panel stays closed.

## Links

- Production audit 2026-11-03, PA-02: the seven lazy imports swallowed the
  stale-chunk rejection before `hooks.client.ts` could see it.
- `src/lib/staleDeploymentRecovery.ts` — recovery module
