# Cachy-App: Status & Risk Report
## Overview
This report outlines the status quo, vulnerabilities, and risks identified during an in-depth code analysis of the cachy-app repository.

## 1. Data Integrity & Mapping
### 1.1 Type Safety & Null Checks (MarketWatcher, TradeService, NewsService)
#### Observations:
- **MarketWatcher**: Uses `applySymbolUpdate` with type `Partial<MarketData>`, but handles incoming WebSocket data loosely. It allows strings/numbers to be lazily converted to Decimals. However, null checks are sometimes implicit.
- **TradeService**: Serializes Decimals to strings safely. However, `Decimal.isDecimal` might fail if constructor names are mangled. Uses a workaround, but needs robust checks if an API sends `null` for a Decimal field.
- **NewsService**: Needs to ensure parsed API responses handle undefined fields defensively.

### 1.2 Serialization & Decimal.js Usage
#### Observations:
- Consistent use of `Decimal.js` is observed in `market.svelte.ts` and `trade.svelte.ts`.
- **Risk**: In `market.svelte.ts` (line 508), Decimals are converted back to floats via `toNumber()` for the `Buffer` directly: `val instanceof Decimal ? val.toNumber() : Number(val)`. This risks precision loss.
- **Risk**: `tradeService.ts` handles `Decimal` strings, but `activeTechnicalsManager.svelte.ts` (from previous context memory) is known to potentially use `Number(price.toString())`. This needs strict enforcement to stay Decimal end-to-end.

## 2. Resource Management & Performance
### 2.1 Memory Leaks (WebSockets & Stores)
#### Observations:
- **BitunixWs**: Needs a review of `destroy()` or cleanup functions. Do they call `.clear()` on `syntheticSubs` and `pendingSubscriptions`? If not, memory leaks occur.
- **Stores**: Stores like `market.svelte.ts` use `Map` or Objects for tracking states. Unbounded growth in caches or inactive pairs must be evicted securely via `.entries()` and reference counting.

### 2.2 Hot Paths & Calculations
#### Observations:
- `market.svelte.ts` handles high-frequency updates via `applySymbolUpdate`. It includes optimizations (e.g., checking equality before creating a new Decimal). However, Svelte runes (`$state`) on deeply nested or large objects can cause unnecessary re-renders if not granular enough.

## 3. UI/UX & Accessibility (A11y)
### 3.1 i18n & Error Messages
#### Observations:
- **Error Messages**: Raw API errors (e.g., `BitunixApiError.rawMessage`) might leak HTML or gateway details to the UI (via `toastService`). These must be caught and mapped to localized keys like `apiErrors.invalidResponse`.
- **Broken States**: Optimistic UI operations (e.g., placing orders in `tradeService`) must not blindly rollback on timeout. An unconfirmed order should be retained with an `_isUnconfirmed` flag to prevent double-ordering if the exchange executed it but the network timed out.

## 4. Security & Validation
### 4.1 Input Validation & DOM manipulation
#### Observations:
- **XSS Risk**: Any use of `{@html}` in Svelte components needs strict wrapping with `DOMPurify.sanitize()`. This is critical for displaying News or Announcements.
- **Input Validation**: Order quantities must be strictly validated as Decimals before transmission.

## 5. Prioritized Findings
🔴 **CRITICAL**
- **Precision Loss (Float Casting)**: `market.svelte.ts` downcasts `Decimal` to `toNumber()` for buffers. Risk of financial miscalculation.
- **XSS Vulnerability**: Potential use of `{@html}` without `DOMPurify` when displaying external data (News/Messages).
- **State Corruption (Optimistic UI)**: Indeterminate backend failures (network timeouts) rolling back local state unconditionally can lead to double-ordering.
- **Resource Leaks (WebSockets)**: Teardown methods might not explicitly `.clear()` internal tracking `Map`/`Set` collections, causing unbounded memory growth.

🟡 **WARNING**
- **Information Disclosure (Errors)**: Exposing raw API error messages containing HTML via `toastService`.
- **Missing i18n**: Hardcoded strings in UI components for generic error mappings.
- **Unbounded Caches**: Lacking bounded eviction strategies for reference-counted Maps.

🔵 **REFACTOR**
- **Type Narrowing in Catch Blocks**: Ensure `catch (e: unknown)` is used consistently instead of `any` to safely extract error messages.
- **Type Safety**: Replace native `JSON.parse` with custom `safeJsonParse` to prevent silent precision loss with large numeric IDs.

## Step 2: Action Plan
### Group 1: Decimal Precision & Data Integrity
- **Fix Decimal to Number downcasting in Buffers**
  - *Location*: `src/stores/market.svelte.ts` and `src/stores/trade.svelte.ts`
  - *Action*: Ensure buffers and history maintain `Decimal` objects end-to-end instead of calling `toNumber()`. If WebGL/Canvas APIs require floats for rendering, do the conversion at the very edge of the rendering layer, not in the store state.
  - *Justification*: Improves stability and prevents financial miscalculation. Financial systems must maintain exact precision.
- **Enforce safeJsonParse**
  - *Location*: `src/services/apiService.ts`, `src/services/newsService.ts`
  - *Action*: Replace `JSON.parse` with custom `safeJsonParse` globally to ensure 64-bit integer IDs from exchanges do not lose precision.
### Group 2: Hardening WebSocket & Resource Management
- **Fix Teardown Leaks**
  - *Location*: `src/services/bitunixWs.ts` (and similar WS providers)
  - *Action*: In `destroy()` or `close()`, explicitly call `.clear()` on `syntheticSubs` and `pendingSubscriptions`.
  - *Test Case*: Instantiate WS, add subscriptions, call `destroy()`, and assert that the internal `Map` sizes are strictly 0.
  - *Justification*: Prevents memory leaks during application lifecycle or reconnection cycles, improving stability over long sessions.
### Group 3: Optimistic UI & State Corruption
- **Fix Double-Ordering on Timeout**
  - *Location*: `src/services/tradeService.ts` (Order Placement)
  - *Action*: Do not unconditionally remove local order state on `unknown` API failures or network timeouts. Introduce an `_isUnconfirmed` flag for indeterminate states so the system awaits reconciliation via WS rather than allowing the user to place the order again.
  - *Test Case*: Mock API to throw network timeout. Verify order remains in store with `_isUnconfirmed = true`.
  - *Justification*: Prevents critical financial losses from double execution.
### Group 4: UI/UX, Security & i18n
- **Sanitize Error Messages**
  - *Location*: API Error handlers & `toastService.svelte.ts`
  - *Action*: Check if raw error messages (like `rawMessage`) contain HTML. If so, fallback to a localized generic key (`apiErrors.invalidResponse`) rather than displaying raw HTML.
- **Fix Type Narrowing in Catch Blocks**
  - *Action*: Replace `catch(e: any)` with `catch(e: unknown)` and type-narrow using `e instanceof Error ? e.message : String(e)`.
- **Sanitize {@html} usage**
  - *Action*: Ensure all `{@html}` directives (e.g. in News components) wrap the payload with `DOMPurify.sanitize()`.
  - *Justification*: Direct mitigation of XSS vulnerabilities (CRITICAL security fix).
## Analysis Addendum
### Security: {@html} usage
A scan of the codebase reveals `{@html}` directives. Most are properly wrapped in `DOMPurify.sanitize()` (e.g., in `Icon.svelte`, `CalculationDashboard.svelte`, `HotkeySettings.svelte`). However, any custom rendering of external content (e.g., News) must be verified to use `DOMPurify`. A dedicated `sanitizer.ts` exists and works properly.

### Resource Management: WebSockets
A scan of WebSocket classes (`bitunixWs.ts`, `bitgetWs.ts`) reveals potential teardown issues. While `syntheticSubs` and `pendingSubscriptions` are cleared during `destroy()`, the intervals (e.g., `pingTimerPublic`, `globalMonitorInterval`) require careful `clearInterval` calls in `destroy()` to prevent zombie timers holding context references.

### UI/UX: i18n
Components utilize `$_` correctly for i18n translation mapping. The problem of hardcoded strings mainly appears in raw API errors and fallbacks, where unmapped gateway errors leak into the UI rather than falling back to `apiErrors.invalidResponse`.
