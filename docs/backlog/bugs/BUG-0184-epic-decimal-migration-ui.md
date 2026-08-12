---
id: BUG-0184
title: "Epic: Migrate Svelte UI components and Stores to decimal.js"
type: bug
status: ready
priority: P1
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [BUG-0183]
---

# BUG-0184 — Epic: Migrate Svelte UI components and Stores to decimal.js

## Symptom

UI components, State Stores, and visual engines were using native JavaScript `number` arithmetic. This violates the precision rules for financial data representation. This Epic consolidates multiple smaller bugs affecting the `.svelte` files and UI state managers.

## Fix & Instructions for Jules

Refactor the UI layer to consume and display `Decimal` objects instead of raw numbers.

- Convert Svelte UI State Stores (`activeTechnicalsManager.svelte.ts`, `ai.svelte.ts`, `effects.svelte.ts`) to manage `Decimal` types.
- Ensure that object comparisons inside `$derived` blocks use `.equals()` rather than `===` (since `new Decimal(1) !== new Decimal(1)`).
- For UI display formatting, use `Decimal` formatting methods (e.g. `.toFixed()`, `.toString()`) and never cast back to raw `Number()` for display unless strictly required by an external chart library that accepts only JS numbers (and only at the very boundary).
- Run `npm run check` heavily. Svelte 5 strict typing will catch most binding mismatches.

## Acceptance criteria

- [ ] All impacted `.svelte` files (e.g. `AiModelPicker`, `MarketOverview`, `VisualBar`, `TradeSetupInputs`, etc.) use `Decimal`.
- [ ] UI visual engines (`RaindropsEngine`, `SonarEngine`, `EqualizerEngine`, etc.) are adapted.
- [ ] `npm run check` passes completely.
- [ ] The app builds (`npm run build`) successfully.
