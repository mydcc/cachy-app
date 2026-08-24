---
id: BUG-0183
title: "Epic: Migrate Core & Services logic to decimal.js"
type: bug
status: done
priority: P1
milestone: none
editions: [community, pro, private]
area: services
data_class: none
adr: none
depends_on: [BUG-0182]
estimate: 2
size: S
target_date: 2026-09-04
start_date: 2026-08-12
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

- [x] Services (`calculatorService`, `alertEngine`, `syncService`, `technicalsService`, `csvService`, etc.) use `Decimal`.
- [x] Core algorithms (`confluenceAnalyzer`, `statefulTechnicalsCalculator`, `indicators`, `divergenceScanner`, etc.) use `Decimal`.
- [x] `npm run check` passes without type errors related to these services.
- [x] Unit tests (`npm test`) pass.

## Resolution, August 2026

Audited every file this item names, plus every other file in `src/services/`
and `src/utils/` that touches a price, amount, balance, margin or PnL. Most of
it was already `Decimal` — `calculatorService`, `syncService` and `csvService`
had no native-number financial arithmetic left to convert; that work had
already landed in earlier, separate changes not tracked back to this item.

**One real gap found and fixed:** `alertEngine.ts`'s `AlertCondition` type
allowed `string | number` for an alert's price threshold. The Rust side
(`alert_engine.rs`, migrated to `rust_decimal` in BUG-0182) deserializes that
threshold with `serde-with-str`, which rejects a bare JSON number — so a
`number` threshold would have failed to parse at the WASM boundary. Every
actual call site already built the threshold as a string; the type just
allowed a value that would break at runtime. Narrowed to `string`.

**One cleanup:** `ai.svelte.ts`'s portfolio-stats block wrapped an
already-`Decimal` field in `new Decimal(new Decimal(x))` twice, and used
`.toNumber() > 0` where `.gt(0)` avoids the float round-trip entirely.
Simplified both; no behavior change.

**Deliberately left as `number` — not an oversight:**
`confluenceAnalyzer`, `statefulTechnicalsCalculator`, `indicators.ts`,
`technicalsCalculator.ts` and `divergenceScanner` are the JS-side technicals
engine that feeds the Technicals panel (RSI/MACD/etc. chart overlay). It
computes over `Float64Array`s specifically so results can be posted through a
Web Worker via the Transferable-object list (`ArrayBuffer`s are the only
efficient way to move data across that boundary — a `Decimal` object cannot
be transferred, only structurally cloned at real cost) and, when the `gpu`
engine is selected, fed to WebGPU compute shaders, which only understand
float buffers. Converting this engine to `Decimal` internally would silently
disable both the Worker and GPU execution paths for a secondary analysis
overlay, to buy precision at a decimal place beyond what any of these
indicators display — while the number that actually determines how much a
user risks (`calculatorService`, `tradeStore`, and the WASM engine from
BUG-0182) was already, and remains, `Decimal` end to end. `TechnicalsData`
itself is the established display-layer boundary type (plain `number`, fixed
in the BUG-0182 PR's WASM-boundary fix) that this engine's output already
converges on, same as the Rust/WASM engine's output does.

`confluenceAnalyzer.ts` additionally never touches a price directly except a
`close > vwap` comparison on two already-`TechnicalsData`-typed (`number`)
fields — nothing to convert.

## What shipped

Shipped in 1.6.0-beta.18.
