---
id: BUG-0184
title: "Epic: Migrate Svelte UI components and Stores to decimal.js"
type: bug
status: done
priority: P1
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [BUG-0183]
estimate: 5
size: L
target_date: 2026-09-14
start_date: 2026-08-12
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

- [x] All impacted `.svelte` files (e.g. `AiModelPicker`, `MarketOverview`, `VisualBar`, `TradeSetupInputs`, etc.) use `Decimal`.
- [x] UI visual engines (`RaindropsEngine`, `SonarEngine`, `EqualizerEngine`, etc.) are adapted.
- [x] `npm run check` passes completely.
- [x] The app builds (`npm run build`) successfully.

## Resolution, August 2026

Audited every file this item names, plus everything reachable from
`tradeState` in `src/components/` and `src/stores/`.

**`AiModelPicker`** holds no financial state (an AI-model selection
dropdown) — nothing to convert. **`MarketOverview`** was already fixed in
BUG-0182's PR (`.toNumber()` → `.toString()` on `entryPrice`).
**`activeTechnicalsManager.svelte.ts`** and **`effects.svelte.ts`** hold no
financial state either — the former only orchestrates which technicals
engine (WASM/GPU/Worker/inline) runs and at what cadence, the latter is a
decorative-animation event bus (`triggerFeed(amount)` feeds a duck-mascot
easter egg, not money). **`RaindropsEngine`/`SonarEngine`/`EqualizerEngine`**
take `{ price: number, amount: number }` for an `onTrade` hook that has no
caller yet; `number` there is correct regardless, since Three.js shader
uniforms and WebGL buffers are the "external chart library" boundary case
this item's own instructions exempt.

**Real bug found and fixed:** `TakeProfitRow.svelte`'s `formatProfit()`
converted a `Decimal` profit to `Number` before calling `.toFixed()`,
exactly the pattern this item's Fix section prohibits. Rewritten to use
`Decimal.toFixed()` directly for the two precision-sensitive branches;
`Number()` stays only for the large-value branch that needs
`.toLocaleString()` grouping, which `decimal.js` has no equivalent for —
documented in a comment. Also dropped a dead `val?.toNumber ? … : Number(val)`
defensive branch (`val` is typed `Decimal`, always has `.toNumber`).

**Real bug found and fixed:** `app.ts`'s `setupFirstStart()` (the
first-launch demo state) hardcoded take-profit targets as
`{ price: 120000, percent: 50 }` — number literals into a field the trade
store persists and reads back as strings. Harmless today only because the
loose `TradeTarget.price/percent: string | number | null` type let it
through silently. Fixed the literals to strings and narrowed
`TradeTarget`'s fields (and the matching prop types in `VisualBar.svelte`,
`TradeSetupInputs.svelte`, `TakeProfitRow.svelte`,
`inputs/TakeProfitTargets.svelte`) to `string | null`, so this class of bug
is a compile error from now on instead of a silent runtime coercion.
(`components/shared/TakeProfitTargets.svelte` carries the same stale union
type but is dead code — not imported anywhere — so it was left alone per
the defensive-deletion rule rather than edited or removed.)

**No `Decimal`-identity `===` bug found.** Swept `$derived` blocks across
`src/components` and `src/stores` for direct `Decimal === Decimal`
comparisons (the `new Decimal(1) !== new Decimal(1)` trap this item's Fix
section calls out) — found none. Existing comparisons on `Decimal` values
already go through `.gt()`/`.lt()`/`.equals()` or compare on an already-
extracted primitive.

`npm run check` (1951 files, 0 errors), `npm test` (1131 passed) and
`npm run build` all verified on this change.

## What shipped

Shipped in 1.6.0-beta.18.
