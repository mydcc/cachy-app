# Implementation Plan

## Phase 1: Critical Hardening & Fixes

### 1. Fix Missing Translations (UX/Crash)
- **Goal:** Prevent runtime errors and show actionable feedback.
- **Action:**
  - Update `src/locales/locales/en.json` to include:
    - `settings.errors.invalidApiKey`
    - `settings.errors.ipNotAllowed`
    - `settings.errors.invalidSignature`
    - `settings.errors.timestampError`
- **Verification:** `read_file` checks on `en.json`.

### 2. Optimize MarketWatcher (Performance)
- **Goal:** Reduce GC pressure in backfill loops.
- **Action:**
  - Move `const ZERO_VOL = new Decimal(0);` out of `fillGaps` in `src/services/marketWatcher.ts` to module scope.
  - Type `klines` argument in `fillGaps` as `Kline[]` instead of `any[]`.
- **Verification:** Run `src/services/marketWatcher.test.ts` (if exists) or create a simple benchmark test.

### 3. Harden Bitunix WebSocket (Data Integrity)
- **Goal:** Enforce type safety for trade data listeners.
- **Action:**
  - Define `interface TradeData` in `src/types/bitunix.ts` (or `bitunixWs.ts`).
  - Update `tradeListeners` map in `src/services/bitunixWs.ts` to use `Set<(trade: TradeData) => void>`.
  - Update `subscribeTrade` signature.
- **Verification:** `tsc` check (via `npm run check` or manual file check).

### 4. Centralize Error Mapping (Maintainability)
- **Goal:** Robust error handling for API failures.
- **Action:**
  - Extract `mapApiErrorToLabel` from `src/components/inputs/PortfolioInputs.svelte` to `src/utils/errorUtils.ts`.
  - Enhance it to check `error.code` in addition to regex on `message`.
  - Import and use it in `PortfolioInputs.svelte`.
- **Verification:** Unit test for `mapApiErrorToLabel`.

## Phase 2: Stability & Testing

### 1. MarketManager Array Limits Test
- **Goal:** Ensure `history` arrays do not grow unbounded.
- **Action:**
  - Create `src/stores/market_limits.test.ts`.
  - Simulate receiving 10,000 updates via `updateSymbolKlines`.
  - Assert `marketState.data[symbol].klines[tf].length` <= `settingsState.chartHistoryLimit`.

### 2. Safe JSON Large Integer Test
- **Goal:** Verify `safeJsonParse` correctly handles large integers to prevent "Fast Path" corruption.
- **Action:**
  - Create `src/utils/safeJson_integers.test.ts`.
  - Test input: `{"id": 9007199254740993}` -> Output string `"9007199254740993"`.

## Execution Order
1. Fix i18n keys (Quick win).
2. `MarketWatcher` optimization.
3. `BitunixWs` type hardening.
4. Error mapping refactor.
5. Create tests.
