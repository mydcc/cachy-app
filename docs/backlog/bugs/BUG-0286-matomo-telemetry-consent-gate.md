---
id: BUG-0286
title: Matomo telemetry loads without a consent gate
type: bug
status: done
assignee: opencode
branch: fix/bug-0286-matomo-consent-gate
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
`src/services/app.ts:70–82`. **Verified 2026-08-23:** there is no `AnalyticsButton`
(or any other toggle) in the codebase — the `_mtm` container loads unconditionally
and nothing suppresses it. The verification question resolves to "no gate exists".

## Decision (2026-08-23, user, final)

**Matomo keeps tracking always — opt-out model, no cookie notice.** The
container loads by default; the settings toggle (System → Performance →
"Usage Statistics") is an opt-out that stops every event push immediately.
Rationale: measurement is anonymized first-party data (self-hosted at
`s.cachy.app`, IP anonymization) under the operator's legitimate interest,
with an objection option — so no consent banner is required. An earlier
opt-in/default-off draft was rejected by the user ("Matomo soll immer
tracken"). `app_symbol` is dropped from default dimensions regardless.

**Operator follow-up (outside this repo):** verify in the Matomo admin that
the container actually enforces no-cookies tracking and IP anonymization and
set a retention period; the privacy pages promise both.

## Cause

Telemetry was wired for operator insight without a consent model attached.

## Fix

1. ~~Verify and document what AnalyticsButton actually controls today~~ —
   resolved: no such toggle exists; see Evidence.
2. Gate the container load behind explicit opt-in (`settingsState.enableTelemetry`,
   default `false`). Remove the unconditional loader and the noscript iframe from
   `app.html`; load via `trackingService.initTracking()` instead.
3. Drop `app_symbol` from default dimensions regardless of the decision.
4. Record the deployment nature (self-hosted vs cloud) and retention in the ADR
   or docs so severity can be reasoned about later — privacy docs already state
   self-hosted first-party at `s.cachy.app`; updated to describe the opt-in flow.

## Acceptance criteria

- [x] With telemetry opted out/default-off, no request to the tracking endpoint
      occurs — asserted against network calls in a test
- [x] Opting in loads exactly the documented events/dimensions; `app_symbol`
      absent from defaults
- [x] DE + EN copy for the consent surface states what is collected and where

## Open questions

- ~~Opt-in (default off) vs. opt-out (default on) for existing installs?~~
  Decided: opt-in, default off — no cookie notice is shown (user decision,
  2026-08-23). Existing installs flip to off with this change; that is intended.
- ~~Is the Matomo instance first-party self-hosted? Affects retention claims.~~
  Yes: self-hosted by Cachy at `s.cachy.app` with IP anonymization (see
  `src/lib/assets/content/privacy.{en,de}.md`).

## Links

- `src/app.html`, `src/services/trackingService.ts`, `src/services/app.ts`
- [`docs/adr/0001-local-first-boundary.md`](../../adr/0001-local-first-boundary.md)
- Security audit 2026-08-23, finding "Matomo telemetry loads without consent gate" (Medium)

## State

Implemented on `fix/bug-0286-matomo-consent-gate` (2026-08-23): container load
moved out of `app.html` into `trackingService.initTracking()`, which loads by
default and honours the new `enableTelemetry` opt-out switch (default on);
`app_symbol` dropped from default dimensions; DE/EN copy + privacy docs
describe the anonymous always-on measurement with opt-out. Verified:
`npm run check` 0 errors; `src/services/trackingService.consent.test.ts`
9/9 green; affected suites (actions, settings, app) green. Done with the
merge of this branch.
