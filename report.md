# In-Depth Status & Risk Report

## 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1. **Missing Strict Types in Trade Execution:**
   - `src/services/tradeService.ts`: Several API payload params and variables use `any` instead of `Record<string, unknown>` or strictly validated schemas, which is dangerous for financial operations.
2. **Missing `Decimal` Types in Raw Data:**
   - Float validation is somewhat loose in UI processing, native JS floats or `Number()` can cause rounding errors and data-loss for high precision calculations.

## 🟡 WARNING (Performance issue, UX error, missing i18n)

1. **Unbounded Map Growth & Timers Leaks:**
   - In Svelte stores (e.g., `src/stores/market.svelte.ts`), interval IDs are explicitly typed as `any` instead of `ReturnType<typeof setInterval>`, posing typing errors in strict mode and missing safety constraints on clearings.
   - Svelte cleanup functions inside closures and timers are a common source of memory leaks if not tied explicitly to store lifecycles.
2. **Hardcoded i18n Strings:**
   - Hardcoded strings are found in some localized UI responses and error constants in `TradeService` (e.g., `"trade.closeAllFailed"` not strictly typed against the mapped key types), breaking UX for international users.

## 🔵 REFACTOR (Code smell, technical debt)

1. **Improper use of `any` across services:**
   - Throughout the Svelte codebase (`src/stores/*`, `src/services/*`), `any` is heavily used. Refactoring strictly with `unknown` and type guards will massively improve code quality.

---

# Action Plan (Implementation Guide)

### Group 1: Strict Typing & `any` Elimination
- **Fix:** Replace instances of `any` with `Record<string, unknown>` and `unknown` across `tradeService.ts`. Ensure `serializePayload` does not rely on `any`. Replace `any[]` array definitions in `market.svelte.ts` loops with strictly typed `Kline[]`.

### Group 2: Timer Safety & Type Hardening
- **Fix:** Refactor `any` typing for interval identifiers across stores (`market.svelte.ts`, `trade.svelte.ts`) to `ReturnType<typeof setInterval>` / `ReturnType<typeof setTimeout>`. Ensure robust `onDestroy` tracking for these instances.

### Group 3: i18n Constants Strict Enforcement
- **Fix:** Update hardcoded text fallbacks and `get(_)` translation lookup invocations in `tradeService.ts` to strictly cast strings as `TranslationKey`.

### Group 4: Float Precision Auditing
- **Fix:** Identify logic where native `JSON.parse` is directly manipulated over `Decimal` processing, forcing `new Decimal()` wrapped inputs across all OMS parsing entries.

> **Defensive Execution:** Changes must be incrementally verified (`npm run check` & `vitest` execution) before pushing the final fixes to verify no regressions in trading paths.
