# Code Analysis & Hardening Report

## Step 1: In-depth analysis & report

### 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1. **Memory Leaks & Unbounded Growth:**
   - `src/services/apiService.ts`: Map `.clear()` usage. `this.cache.clear()` and `this.pending.clear()` completely wipe out the caches, which causes thundering herds right after. We should implement bounded eviction strategies as per guidelines.
   - `src/services/incrementalCache.ts`: Uses `this.cache.clear()` completely wiping it.
   - `src/services/omsService.ts`: Map `.clear()` used on `this.orders` and `this.positions`. Active states will be completely lost if cleared. We need bounded eviction or logical filtering.
   - **Timers:** Svelte stores (`stores/ui.svelte.ts`, `stores/indicator.svelte.ts`, `stores/settings.svelte.ts`, etc.) use `setInterval`/`setTimeout` and never clear them in `destroy()` hooks.
2. **Missing Promise Deduplication (Thundering Herd):**
   - Several services don't appear to cache in-flight promises. Example: `TradeService` needs deduping for network requests (e.g. `fetchPositionsPromise`).
3. **Data Integrity & Floating Point inaccuracies:**
   - In `src/services/bitunixWs.ts`, there are some cases of manual string/number parsing. We should ensure Decimal types are used for everything.

### 🟡 WARNING (Performance issue, UX error, missing i18n)

1. **Missing i18n / Hardcoded Strings:**
   - While `src/locales/i18n` is heavily imported, we need to find hardcoded error messages/UI text in `src/services/tradeService.ts`, `src/services/marketWatcher.ts`, `src/services/newsService.ts` and replace them with standard keys from `TRADE_ERRORS` or generic translation map lookups.
   - Example in `src/services/tradeService.ts`: Error `Bitunix API Error ${code}` hardcoded at line 62.
2. **UI/UX Error Handling:**
   - Some error catches still expose raw error text or `e.message` to console/logs, which might leak gateway details instead of mapping to generic error types.
   - In Svelte `setTimeout` uses, there are some `errorTimeout` variables that might cause broken states if the internet drops and Svelte renders a half-state.

### 🔵 REFACTOR (Code smell, technical debt)

1. **Defensive Programming:**
   - In WS parsing logic (like `src/services/bitunixWs.ts`), replace loose `any` types with `zod` validations, similar to the existing `BitunixPositionSchema`.
