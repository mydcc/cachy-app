---
id: FEAT-0341
title: "Epic: Q3 Codebase Modernization & Tech Debt"
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

## Problem
The codebase contains several areas of accumulated technical debt that violate the core principles outlined in `AGENTS.md` and `CLAUDE.md`, or severely impact maintainability. 
This Epic groups the Q3 modernization efforts into actionable items.

## Fix
The following items are part of this Epic:
- **FEAT-0342**: Decompose remaining god modules (e.g. VisualsTab.svelte, tradeService.ts).
- **FEAT-0343**: Migrate legacy Svelte 4 `createEventDispatcher` to Svelte 5 `$props()` callbacks.
- **FEAT-0344**: Replace hardcoded hex colors with CSS design tokens.
- **FEAT-0345**: Migrate indicator and charting variables to decimal.js.
- **FEAT-0346**: Increase component test coverage for critical UI elements.
- **BUG-0347**: Modals show frozen price and PnL due to static snapshot props (P0)
- **FEAT-0352**: Migrate all raw localStorage access to storageWrapper (P1)
- **FEAT-0353**: Extract hardcoded UI strings to i18n dictionary (P2)

## Acceptance criteria
- [ ] FEAT-0342 is done
- [ ] FEAT-0343 is done
- [ ] FEAT-0344 is done
- [ ] FEAT-0345 is done
- [ ] FEAT-0346 is done
- [ ] BUG-0347 is done
- [ ] FEAT-0352 is done
- [ ] FEAT-0353 is done

## Out of scope
- Complete refactoring of the entire application.
- Changing application features or user flows.
