# Code Analysis & Hardening Report

## Status Quo
The codebase generally exhibits a high standard of engineering ("Institutional Grade" aspirations) with robust patterns for data safety (`Decimal.js`, `safeJsonParse`), state management (Svelte 5 Runes), and resource handling. However, several risks regarding error localization, "Fast Path" complexity, and debug logging remain.

## Findings

### 🔴 CRITICAL (Risk of Data Loss / Crash / Inconsistency)

1. **Backend Error Propagation (I18n/Safety)**
   - **Location:** `src/routes/api/orders/+server.ts`
   - **Issue:** The server endpoint throws raw error strings from the exchange API directly (e.g., `throw new Error(res.msg)` or `throw new Error("Bitunix error: " + res.code)`).
   - **Risk:**
     1. **Data Leak:** Raw backend errors might expose internal logic or sensitive fields.
     2. **UX Failure:** The frontend expects localized error keys (e.g., `tradeErrors.positionNotFound`). Receiving "Parameter Error" or Chinese error messages breaks the UI experience.
   - **Recommendation:** Map all backend error codes to `apiErrors.*` or `tradeErrors.*` keys before throwing.

2. **WebSocket "Fast Path" Precision Risk**
   - **Location:** `src/services/bitunixWs.ts`
   - **Issue:** The "Fast Path" logic bypasses Zod validation for performance. It relies on `safeJsonParse` having already converted large numbers to strings.
   - **Detail:**
     ```typescript
     // bitunixWs.ts
     const ip = typeof data.ip === 'number' ? String(data.ip) : data.ip;
     ```
     If `safeJsonParse`'s regex (`\d[\d.eE+-]{14,}`) fails to catch a 13-digit high-precision number (e.g., `0.000000001234`), `JSON.parse` will convert it to a `number`, potentially introducing floating-point artifacts *before* this line executes.
   - **Recommendation:** Audit `safeJsonParse` regex to ensure it catches high-precision small decimals, or enforce string parsing at the `safeJsonParse` level for *all* numeric values in specific fields.

### 🟡 WARNING (UX / Performance / Maintainability)

1. **Production Console Logging**
   - **Location:**
     - `src/routes/+layout.svelte` (`console.log`)
     - `src/stores/floatingWindows.svelte.ts` (`console.log` for window events)
     - `src/hooks.server.ts` (Overrides `console.log` - risky if implementation is buggy)
   - **Risk:** Clutters production logs, potential performance hit in tight loops (though rare here), and potential data leakage if objects are logged.
   - **Recommendation:** Replace all `console.log` with `logger.debug` or remove them.

2. **Error String Hardcoding**
   - **Location:** `src/services/tradeService.ts`
   - **Issue:** `TRADE_ERRORS` constants are string keys (`"trade.positionNotFound"`), which is good, but some `Error` instantiations in helper methods might use raw strings that aren't keys.
   - **Verification:** `tradeService.ts` seems mostly clean, using keys. But `apiService.ts` and `orders/+server.ts` are the main offenders.

3. **Symbol & Key Normalization Complexity**
   - **Location:** `src/services/mdaService.ts` vs `bitunixWs.ts`
   - **Issue:** Normalization logic is duplicated or split. `bitunixWs.ts` does manual normalization in the fast path: `const symbol = normalizeSymbol(rawSymbol, "bitunix");`.
   - **Risk:** If `normalizeSymbol` logic changes, the fast path might drift.

### 🔵 REFACTOR (Technical Debt)

1. **MarketWatcher Complexity**
   - **Location:** `src/services/marketWatcher.ts`
   - **Issue:** The `performPollingCycle` uses a complex mix of `Set`, `Map`, and recursive `setTimeout`. While functional, it's hard to debug.
   - **Recommendation:** Consider a dedicated `Scheduler` class or library if complexity grows.

2. **Duplicate Error Definitions**
   - **Location:** `src/types/apiSchemas.ts` vs `src/locales/locales/en.json`
   - **Issue:** Error logic is spread between schema validation messages and locale files.

## Action Items (Prioritized)

1. **[Hardening]** Refactor `src/routes/api/orders/+server.ts` to throw typed `ApiError` with localized keys.
2. **[Cleanup]** Remove `console.log` from `src/routes/+layout.svelte` and stores.
3. **[Safety]** Add unit test for `safeJsonParse` specifically targeting 12-13 digit high-precision small decimals.
4. **[Validation]** Verify `TradeSetupInputs` handles the "Fast Path" data correctly if it bypasses stores.

## Conclusion
The application is in a very strong state. The risks are primarily in "Edge Case Error Handling" and "Logging Hygiene". Addressing the `orders` endpoint error handling is the highest priority for "Institutional Grade" robustness.
