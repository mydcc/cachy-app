---
id: BUG-0778
title: Telemetry sends Class A settings and symbol-bearing window ids
type: bug
status: in-progress
priority: P0
milestone: none
editions: [community, pro, private]
area: security
data_class: A
adr: ADR-0001
depends_on: []
assignee: opencode
branch: fix/telemetry-class-a-fields
---

# BUG-0778 — Telemetry sends Class A settings and symbol-bearing window ids

## Symptom

Every telemetry event carries three Class A settings values — the active
theme, the API provider and the background style — plus the ids of all open
windows. A chart window's id is `chart-${symbol}` (`ChartWindow.svelte.ts:66`),
so `app_modals` discloses which symbols the trader has open.

ADR-0001 and AGENTS.md forbid sending Class A data to any Cachy-operated
server "in any form, including telemetry". The consent gate from BUG-0286
controls whether telemetry runs at all; it does not make the payload allowed.

## Evidence

**Derived.** No incident observed; the defect follows from the code.

- `src/services/app.ts:77-79` sent `uiState.currentTheme`,
  `settingsState.apiProvider` and `settingsState.backgroundType`.
- `src/services/app.ts:81` sent `uiState.windows.map((w) => w.id)`.
- `src/lib/windows/implementations/ChartWindow.svelte.ts:66` builds the id as
  `chart-${symbol}`.
- `src/locales/locales/en.json:2443` and `de.json:2185` listed those fields as
  sent, so the disclosure was accurate about a payload the boundary rule
  forbids.

## Cause

The provider was written as a generic "app context" object before the
Class A/Class B boundary was made explicit, and the window id was reused
because it was the convenient identity for deduplication.

## Fix

- Move the provider into `src/services/telemetryContext.ts` and drop
  `app_theme`, `app_provider` and `app_background`.
- Reduce `app_modals` to the window *types* (`chart,settings,…`), never the
  symbol-bearing id.
- Update the telemetry description in both locales to match the payload.
- Pin both rules with a unit test on the provider.

## Acceptance criteria

- [x] No telemetry context contains `app_theme`, `app_provider` or
      `app_background`.
- [x] `app_modals` contains window types only; a `chart-BTCUSDT` window never
      leaks `BTCUSDT`.
- [x] `de.json` and `en.json` describe the reduced payload.
- [x] The provider unit test fails if either rule is broken.

## Out of scope

- The consent/opt-out mechanism itself (BUG-0286, done).
- Any other Matomo event payload outside the shared context provider.

## Links

- Audit: `~/.local/state/cachy-audit/2026-11-03/w1-structure.md` (W1-01)
- ADR-0001 — Local-First boundary
- BUG-0286 — Matomo consent gate (done)
