# In-depth Analysis & Report

## 🔴 CRITICAL: Risk of financial loss, crash, or security vulnerability.

1. **Missing Strict Types in Trade Logic (`src/services/tradeService.ts`)**:
   - `cancelTpSlOrder(order: any)` uses `any` instead of the strictly typed `TpSlOrder`. This risks executing a cancellation with missing or incorrect fields.
   - `fetchTpSlOrders` performs weak array/row checks: `const list = (Array.isArray(data) ? data : data.rows || []) as TpSlOrder[];` without Zod passthrough validation (`TpSlOrderSchema`), risking logic failures on malformed API responses.

2. **Deduplication / Promise Coalescing Issues**:
   - `src/services/tradeService.ts` (`fetchTpSlOrders` and potentially others): Simultaneous API calls might not be properly deduped (the "thundering herd" problem), potentially hitting rate limits, which in a trading context could block critical order execution calls.

3. **Memory Leaks via Indiscriminate `.clear()` (`src/stores/market.svelte.ts`, `src/services/marketWatcher.ts`)**:
   - `this.exhaustedHistory.clear()` in `MarketWatcher` uses indiscriminate clearing when exceeding `1000`, losing all state.
   - `.clear()` is used in `market.svelte.ts` on Svelte `destroy`, but unbounded growth during runtime needs bounds/LRU caches instead of indiscriminate clearing.

## 🟡 WARNING: Performance issue, UX error, missing i18n.

1. **Hardcoded Error Strings (i18n missing)**:
   - Numerous services have raw English strings inside `throw new Error(...)`. E.g., `src/stores/chat.svelte.ts`: `throw new Error("Please wait 2 seconds between messages.")`
   - `src/stores/ai.svelte.ts`: `throw new Error("Failed to connect to AI provider after retries.")`
   - Multiple `+server.ts` endpoints (e.g. `api/account/+server.ts`) have hardcoded text.
   - These must be replaced with localized i18n keys and/or defined error constants (`apiErrors.invalidResponse`).

2. **Interval Zombie Leaks**:
   - Components like `MarketWatcher`, `bitunixWs`, and others start `setInterval` loops. We need to verify that `clearInterval` is reliably called in all scenarios, particularly on HMR / Store destruction.

## 🔵 REFACTOR: Code smell, technical debt.

1. **Typing & Serialization (`src/types/apiSchemas.ts` / `src/services/newsService.ts`)**:
   - Usage of `parseFloat()` or `Number()` might bypass `Decimal.js` for financial quantities in some places. Check all string-to-number conversions for volume or prices to guarantee `new Decimal()`.
