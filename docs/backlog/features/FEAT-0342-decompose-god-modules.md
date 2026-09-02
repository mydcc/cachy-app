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
