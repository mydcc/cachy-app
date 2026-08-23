---
id: BUG-0286
title: Matomo telemetry loads without a consent gate
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: core
data_class: none
adr: none
depends_on: []
---

# BUG-0261 — Matomo telemetry loads without a consent gate

## Symptom

The Matomo Tag Manager container loads unconditionally (except localhost/LAN)
from `s.cachy.app` (`src/app.html:139–156`). Every event carries context-provider
dimensions including `app_symbol` (the pair currently being viewed), active
provider and open modals; sync events push counts. Behavioural telemetry leaves
the device with no visible opt-in/opt-out — in tension with the local-first
promise ("never sent to a server, not even as telemetry") even though the content
is usage metadata rather than Class A fields.

## Evidence

**Derived** — from reading `src/app.html`, `src/services/trackingService.ts` and
`src/services/app.ts:70–82`. **Needs manual verification before fixing:** whether
the existing AnalyticsButton suppresses loading of the `_mtm` container itself or
only stops event pushes — if only pushes, page-view tracking still fires.

## Cause

Telemetry was wired for operator insight without a consent model attached.

## Fix

Decide the consent model, then implement it:

1. Verify and document what AnalyticsButton actually controls today.
2. Gate the container load behind explicit opt-in (or make the existing toggle
   genuinely suppress the script), defaulting to off for new installs.
3. Drop `app_symbol` from default dimensions regardless of the decision.
4. Record the deployment nature (self-hosted vs cloud) and retention in the ADR
   or docs so severity can be reasoned about later.

## Acceptance criteria

- [ ] With telemetry opted out/default-off, no request to the tracking endpoint
      occurs — asserted against network calls in a test
- [ ] Opting in loads exactly the documented events/dimensions; `app_symbol`
      absent from defaults
- [ ] DE + EN copy for the consent surface states what is collected and where

## Open questions

- Opt-in (default off) vs. opt-out (default on) for existing installs?
  Local-first wording suggests opt-in; changing existing behaviour needs a call.
- Is the Matomo instance first-party self-hosted? Affects retention claims.

## Links

- `src/app.html`, `src/services/trackingService.ts`, `src/services/app.ts`
- [`docs/adr/0001-local-first-boundary.md`](../../adr/0001-local-first-boundary.md)
- Security audit 2026-08-23, finding "Matomo telemetry loads without consent gate" (Medium)
