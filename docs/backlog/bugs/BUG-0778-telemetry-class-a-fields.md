---
id: BUG-0778
title: Telemetry sends Class A settings and symbol-bearing window ids
type: bug
status: done
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

- `src/services/app.ts:78-80` sent `uiState.currentTheme`,
  `settingsState.apiProvider` and `settingsState.backgroundType`.
- `src/services/app.ts:81` sent `uiState.windows.map((w) => w.id)`.
- `src/lib/windows/implementations/ChartWindow.svelte.ts:66` builds the id as
  `chart-${symbol}`.
- `src/locales/locales/en.json:2443` and `de.json:2185` listed those fields as
  sent, so the disclosure was accurate about a payload the boundary rule
  forbids.

## Cause

The original intent is not reconstructible: the provider's only history in
this repository is a squash import. The shape — a generic "app context"
object — suggests it was written before ADR-0001 named the fields.

## Fix

- Extract a pure `buildTelemetryContext(windows, viewport)` into
  `src/services/telemetryContext.ts`. It reads only `windowType` and imports
  no store, so the `services → stores` ratchet stays untouched.
- Drop `app_theme`, `app_provider` and `app_background`; reduce `app_modals`
  to the window *types* (`chart,settings,…`), never the symbol-bearing id.
- Update the telemetry description in the locales, the privacy page and the
  user manual to match the payload.
- Pin the payload with a builder unit test and the wiring with a source guard
  over `app.ts`.

## Acceptance criteria

- [x] No telemetry context contains `app_theme`, `app_provider` or
      `app_background`.
- [x] `app_modals` contains window types only; a `chart-BTCUSDT` window never
      leaks `BTCUSDT`.
- [x] `de.json` and `en.json` describe the reduced payload.
- [x] The builder unit test fails if a Class A dimension or an identifier is
      added; the source guard fails if `app.ts` stops calling the builder.

## Out of scope

- The consent/opt-out mechanism itself (BUG-0286, done).
- Symbol-bearing events outside the shared provider (`TradeSetupInputs`,
  `MarketOverview`, `GlobalTracker`); tracked as audit item W1-10 / B12.

## Decisions

- `app_viewport` and `app_zoom` stay: they are not Class A under ADR-0001,
  though together they are a fingerprinting signal. Bucketing them is a
  separate privacy decision.
- `app_modals` keeps the window types (`chart`, `journal`, …): that is usage
  behaviour, not Class A content. `WindowType` is a closed union, so a symbol
  or title cannot enter through it.

## Links

- Audit 2026-11-03, W1-01 (`w1-structure`)
- ADR-0001 — Local-First boundary
- BUG-0286 — Matomo consent gate (done)
