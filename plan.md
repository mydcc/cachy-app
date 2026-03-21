# Analysis & Plan

Based on the prompt to perform systematic maintenance and hardening for a high-frequency trading platform (cachy-app), I'll plan to fix issues categorized by criticality, ensuring adherence to the strict "Zero-Error Mode" and "Ironclad 5-Phase Process".

## Phase 1 Findings

🔴 **CRITICAL**
1. `src/services/marketWatcher.ts`: `pendingRequests` Map is cleared without rejecting pending Promises in `forceCleanup()`. This can cause callers waiting on `Promise`s in `pendingRequests` to hang indefinitely if a cleanup happens while requests are in flight.
2. `src/services/marketWatcher.ts`: Memory leak potential. `pendingRequests` tracks Promises but does not bound them or clear them selectively based on age.
3. `src/services/marketWatcher.ts`: `forceCleanup` clears maps, but not all sets (`historyLocks`).
4. `src/services/tradeService.ts`: Several error messages use raw strings instead of predefined `TRADE_ERRORS` constants (e.g., `throw new Error("tradeErrors.fetchFailed")` vs `throw new Error(TRADE_ERRORS.FETCH_FAILED)`), leading to missing or incorrect i18n keys. Also uses undefined keys like `apiErrors.missingCredentials`, `apiErrors.invalidAmount`, `apiErrors.fetchFailed`.
5. `src/services/newsService.ts`: Uses `new Decimal()` without checking for NaN or Infinity after parse.

🟡 **WARNING**
1. I18n strings in `src/locales/locales/en.json` are missing several `apiErrors` and `tradeErrors` referenced in code.

## Execution Plan
