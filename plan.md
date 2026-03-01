# Phase 1: In-depth analysis & report (Read-only phase)

## Findings

### 🔴 CRITICAL: Risk of financial loss, crash, or security vulnerability.

1. **Floating Point Inaccuracies**:
   - `src/utils/fastConversion.ts` optimizes API response strings -> numbers using `parseFloat(val.toString())` on `Decimal` objects, which loses precision compared to using `.toString()` and constructing a new `Decimal`.
   - `src/utils/inputUtils.ts`, `src/routes/api/positions/+server.ts`, and various components (`TradeSetupInputs.svelte`, `VisualsTab.svelte`, `MarketOverview.svelte`) make heavy use of `parseFloat`, risking floating point errors on large/small financial figures. Financial data *must* use `Decimal`.
   - `src/utils/utils.ts` -> `parseDecimal`: Currently casts numbers.

2. **Type Safety & Data Integrity**:
   - Usage of `any` types in `src/services/tradeService.ts` and `src/services/newsService.ts` for payloads, errors, API requests, bypassing strict typing. `e as any`, `payload: any`
   - Unsafe array allocations/buffers. `src/stores/market.svelte.ts` has a hard limit, but `src/services/marketWatcher.ts` accesses arrays.

3. **Potential Memory Leaks**:
   - Re-rendering UI threads on high frequency updates because primitive values instead of reactive wrappers are used.
   - `src/services/marketWatcher.ts` tracks timestamps and requests. `prunedRequestIds` avoids double decrements, but we need to ensure Maps aren't growing indefinitely.

### 🟡 WARNING: Performance issue, UX error, missing i18n.

1. **Missing i18n**:
   - Hardcoded strings in `src/components/settings/tabs/IndicatorSettings.svelte` ("Summary", "Oscillators", "Volatility", etc.), `src/lib/windows/implementations/AssistantView.svelte`, `src/lib/windows/implementations/SymbolPickerView.svelte`, and `src/components/settings/EngineDebugPanel.svelte`.
   - `src/routes/+layout.svelte` and API endpoints have hardcoded error strings that bypass the i18n system.

2. **Broken States / Actionable Errors**:
   - Generic `e as any` exceptions don't give the user clear feedback if the API is down or throwing a 500 error.

### 🔵 REFACTOR: Code smell, technical debt.

1. **Svelte 5 Runes**:
   - Ensure `export let` is not hiding anywhere in older/unmodified components.
   - `$:` reactivity being used instead of `$derived`.
   - Component state management uses `$state` safely, but needs audit on cleanup for WebSocket subscriptions.

---

# Phase 2: Action Plan (Planning Phase)

1. **Fix Critical Math & Precision Bugs (Decimal Hardening)**
   - Replace unsafe `parseFloat` and JavaScript `Number` types with `Decimal.js` inside `src/routes/api/positions/+server.ts`, `src/utils/fastConversion.ts`, and core stores.
   - Update `parseDecimal` in `src/utils/utils.ts` to strictly handle and maintain precision.

2. **Fix Memory Leaks & Type Safety (Resource Hardening)**
   - Replace `any` types in `tradeService.ts` with strongly typed schemas or `unknown` + type guards.
   - Audit and confirm `marketWatcher.ts` Map clearing.

3. **Fix i18n (UI/UX Hardening)**
   - Extract hardcoded strings from `IndicatorSettings.svelte`, `SymbolPickerView.svelte`, etc., into `de.json` and `en.json` and use the `$_()` translation store.
   - Standardize error strings in API endpoints to use i18n keys.

4. **Verify Svelte 5 Compliance**
   - Ensure all `.svelte` files follow Svelte 5 Runes explicitly without `export let` or `$:`.

5. **Pre-commit Steps**
   - Complete pre-commit steps to make sure proper testing, verifications, reviews and reflections are done.
