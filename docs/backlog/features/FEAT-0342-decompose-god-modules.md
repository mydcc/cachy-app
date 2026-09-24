---
id: FEAT-0342
title: "Decompose remaining god modules (VisualsTab, tradeService)"
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
parent: FEAT-0341
---

## Problem
Despite previous decomposition efforts (FEAT-0190), several files remain excessively large ("God Modules"):
- `src/components/settings/tabs/VisualsTab.svelte` (~1930 lines)
- `src/stores/settings.svelte.ts` (~2130 lines)
- `src/services/tradeService.ts` (~1700 lines)
- `src/services/apiService.ts` (~1200 lines)

These monolithic files violate clean architecture principles, making maintenance and concurrent development difficult.

## Fix
Decompose these files into smaller, focused modules or sub-components.
For `VisualsTab.svelte`, extract repeated markup into smaller components like `<ColorPickerSection>` and `<VisualGroup>`, or drive the UI via a data configuration schema.
For the services, split responsibilities by domain (e.g., splitting `apiService` into exchange, user, and ai).

## Acceptance criteria
- [ ] `VisualsTab.svelte` is decomposed and falls below 500 lines of code.
- [ ] `tradeService.ts` is split into domain-specific services.
- [ ] `settings.svelte.ts` is refactored into smaller isolated state stores.
- [ ] `apiService.ts` is divided.
- [ ] All existing unit tests pass, and new tests are written for the extracted modules.
## Out of scope

- Changing the functionality of the settings or trading logic.
- Splitting every file in the project (only the ones explicitly listed).

## Status note (2026-09-24, slice 1 merged; follow-up remains specced)

`VisualsTab.svelte` is already 77 lines (decomposed before this item started).
Slice 1 extracts the safe mechanical seams, all suites green:

- `src/services/apiService.ts` (1247 → ~60 lines): fully divided into
  `src/services/api/` (`marketData`, `requestManager`, `rateLimiter`,
  `marketTypes`, `apiErrors`) plus new `telemetry.ts` injection ports — the
  move also fixed the services-must-not-import-stores violation instead of
  extending the grandfather list. Public surface unchanged (compat module).
- `src/services/tradeService.ts`: errors + order param contracts extracted
  to `src/services/trade/` (`tradeErrors`, `tradeParams`), re-exported.
- `src/stores/settings.svelte.ts`: domain types + presets extracted to
  `src/stores/settings/settingsTypes.ts`, re-exported.

Remainder (NOT in this PR — needs its own slice): splitting the stateful
`TradeService` class and the `SettingsManager` rune graph into domain
services/stores. Both share private mutable state across domains; that
surgery is high-risk exchange/settings code and does not fit a drive-by
refactor. Proposed follow-up: one item per class split, each with Human
review before merge. The stale `in-progress` claim was released on 2026-09-24
because no active session or worktree remains.
