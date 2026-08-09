# Cachy App Code Analysis Report

## 1. Data integrity & mapping

### Type Safety (Interfaces)
- **MarketWatcher, TradeService, NewsService**: There are extensive interfaces in place. The `NewsService` has basic interfaces like `NewsItem`, `SentimentAnalysis`, etc. `TradeService` has `TpSlOrder` and interfaces for placing orders. However, there are potential issues with how dynamic responses are handled, notably with `unknown` types when mapping API responses, which must be cast to a non-null object record before access.

### Decimal.js Usage vs Native Number
🔴 **CRITICAL**: The codebase frequently uses `Number()`, `parseFloat()`, and `.toNumber()` on `Decimal` objects. This poses a significant risk of floating point inaccuracies, especially in financial calculations where precision is paramount.
- *Examples found*:
  - `src/services/activeTechnicalsManager.svelte.ts`: Uses `.toNumber()` on price variables.
  - `src/components/shared/MarketOverview.svelte`: Uses `parseFloat(s)` instead of `Decimal`.
  - `src/components/shared/backgrounds/TradeFlowBackground.svelte`: Uses `parseFloat` on prices and amounts.
  - `src/components/shared/MarketDashboardModal.svelte`: Uses `parseFloat` on RSI values and prices.
- *Recommendation*: Eliminate `.toNumber()`, `Number()`, and `parseFloat()` in financial calculations and replace them with `Decimal` operations. If a component expects a number, pass the `Decimal` string or refactor it to accept `Decimal`.

## 2. Resource Management & Performance

### Potential Memory Leaks (Websockets, Timers, Arrays)
🔴 **CRITICAL**: There are multiple `setInterval` calls and unbounded array `.push()` calls that can lead to memory leaks, especially if intervals are not cleared when components or services are destroyed.
- *WebSockets*:
  - `src/services/bitunixWs.ts`, `src/services/bitgetWs.ts`: Bare `new WebSocket` instances without obvious guaranteed teardowns upon connection failure/replacement.
- *Timers (setInterval)*:
  - `src/services/apiService.ts`: `this.cleanupInterval = setInterval(() => this.pruneCache(), this.CLEANUP_INTERVAL);`
  - `src/services/bitunixWs.ts`: `this.globalMonitorInterval = setInterval(...)`
  - `src/services/fundingRateService.ts`: `this.intervalId = setInterval(...)`
  - *Recommendation*: Ensure all intervals are stored as class properties and cleared in a `dispose()` or `teardown()` method.
- *Arrays*:
  - `src/services/marketWatcher.ts`: Pushing items without bounding array size, e.g., `tasks.push(...)`, `allNewKlines.push(...)`.

### Svelte Re-renders
🟡 **WARNING**: `requestAnimationFrame` and `setInterval` are used heavily in components, particularly in backgrounds and overlays (`TradeFlowBackground.svelte`, `galaxy.worker.ts`, `FireOverlay.svelte`). While some are in workers, UI thread intervals (e.g., `CalculationDashboard.svelte`, `PerformanceMonitor.svelte`) can cause unnecessary re-renders.
- *Recommendation*: Throttle UI updates or use derived state/Svelte runes effectively instead of polling on the main thread where possible.

## 3. UI/UX & Accessibility (A11y)

### Missing i18n keys
🟡 **WARNING**: Hardcoded strings found in Svelte components.
- *Examples found*:
  - `src/components/settings/tabs/IndicatorSettings.svelte`: `<span>Panel Configuration</span>`
  - `src/components/shared/TechnicalsPanel.svelte`: `<span>Vol MA</span>`, `<span>Choppiness</span>`, `<span>Parabolic SAR</span>`, `<span>Market Structure High</span>`, `<span>Market Structure Low</span>`
- *Recommendation*: Replace these with `$_('...')` i18n variables.

### Error Handling
🟡 **WARNING**: Widespread generic `catch (e)` blocks without proper actionable error messaging or fallback states.
- *Examples*:
  - `src/services/rmsService.ts:110`
  - `src/services/engineBenchmark.ts:133`
  - `src/services/dataRepairService.ts:217`
  - `src/services/apiService.ts:304`
- *Recommendation*: Errors, especially API failures (500s) or network disconnections, must be propagated to a user-facing toast service (`toastService.svelte.ts`) with clear instructions. For "broken states", implement error boundaries or fallback UI components when APIs fail.

## 4. Security & validation

### User Input Validation
🔴 **CRITICAL**: The `submitOrder` and `placeOrder` methods in `TradeService` (e.g., lines 296, 513) pass `qty` directly from input/state. If `amount` is missing, it falls back to `position.amount.toString()`.
- *Recommendation*: Add strict validation on user inputs (price, quantity) against minimum order sizes, maximum precision, and available balance *before* initiating the API request.

### DOM Manipulation (XSS risks)
🔴 **CRITICAL**: Unsafe use of `{@html}` in Svelte components.
- *Examples found*:
  - `src/components/results/SummaryResults.svelte`: `{@html icons.lockClosed}`
  - `src/components/settings/HotkeySettings.svelte`: `{@html DOMPurify.sanitize($_(...))}` (This one is correct!)
  - `src/components/shared/DashboardNav.svelte`: `{@html preset.icon}`
  - `src/components/shared/ToastItem.svelte`: `{@html icons[toast.type]}`
- *Recommendation*: Ensure all `{@html}` usages (except static internal icons that are tightly controlled) are wrapped in `DOMPurify.sanitize()` to prevent XSS.

---

## Action Plan

1. **Fix Missing i18n Keys (WARNING)**
   - Extract hardcoded strings in `IndicatorSettings.svelte` and `TechnicalsPanel.svelte` into locale files and use `$_()`.
2. **Harden Financial Calculations (CRITICAL)**
   - Replace `parseFloat` and `.toNumber()` in `activeTechnicalsManager.svelte.ts` and `MarketOverview.svelte` with `Decimal` operations.
   - **Test Case**: Add a unit test verifying precision on tiny fraction amounts (e.g., `0.00000001` BTC) when passed through technicals logic.
3. **Prevent Memory Leaks (CRITICAL)**
   - Add explicit `clearInterval` handling in `dispose()` methods for `apiService.ts`, `bitunixWs.ts`, and `fundingRateService.ts`.
   - Implement bounded sizes or proper eviction for arrays in `MarketWatcher.ts`.
4. **Sanitize DOM Insertion (CRITICAL)**
   - Wrap dynamic `{@html}` variables with `DOMPurify.sanitize()` across all components (e.g., `ToastItem.svelte`).
5. **Pre-commit Steps**
   - Execute all standard tests using `npm install && npm run check && npm run test`.
   - Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
6. **Submit Changes**
   - Finalize tasks by submitting the repository with all analytical artifacts.
