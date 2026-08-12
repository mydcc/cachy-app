---
id: BUG-0183
title: "Epic: Migrate Core & Services logic to decimal.js"
type: bug
status: ready
priority: P1
milestone: none
editions: [community, pro, private]
area: services
data_class: none
adr: none
depends_on: [BUG-0182]
---

# BUG-0183 — Epic: Migrate Core & Services logic to decimal.js

## Symptom

Financial calculations or representations were using native JavaScript `number` arithmetic in Core & Services. This violates the zero-tolerance policy for floating-point inaccuracies. This Epic consolidates multiple smaller bugs (e.g., calculatorService, alertEngine, syncService, etc.).

## Fix & Instructions for Jules

Refactor the code to use `Decimal` from `decimal.js` for all financial calculations, types, and logic.

- Replace `number` types for prices, amounts, margins, and PnL with `Decimal`.
- Swap out native mathematical operators (`+`, `-`, `*`, `/`, `>`, `<`) for `Decimal` methods (`.plus()`, `.minus()`, `.times()`, `.div()`, `.gt()`, `.lt()`).
- Explicitly instantiate `new Decimal(val)` when deserializing API responses or receiving Strings from the WASM backend.
- Ensure you run `npm run check` (Svelte-Check) and `npm run test` (Vitest) continuously to catch type errors.

## Acceptance criteria

- [ ] Services (`calculatorService`, `alertEngine`, `syncService`, `technicalsService`, `csvService`, etc.) use `Decimal`.
- [ ] Core algorithms (`confluenceAnalyzer`, `statefulTechnicalsCalculator`, `indicators`, `divergenceScanner`, etc.) use `Decimal`.
- [ ] `npm run check` passes without type errors related to these services.
- [ ] Unit tests (`npm test`) pass.
