# Codebase Analysis & Status Report: cachy-app

## Step 1: In-Depth Analysis

### Data Integrity & Mapping
- **Type Safety & Null Checks (MarketWatcher, TradeService, NewsService)**: `TradeService` handles API responses but occasionally relies on casting rather than strict Zod parsing for some endpoints. Null/undefined checks are present but could be more aggressive (e.g., handling missing WebSocket fields before processing).
- **API Response Deserialization (Floating Point Issues)**: There is inconsistent usage of native floating-point math vs. `Decimal.js`. For example, `src/services/mdaService.ts` uses `Number(k.time)` and some UI components (`SymbolPickerView.svelte`, `PositionsSidebar.svelte`, `PortfolioInputs.svelte`) use `parseFloat` or `Number()`. This poses a risk of floating-point inaccuracies in financial data.

### Resource Management & Performance
- **Memory Leaks**: Several files contain arrays that grow indefinitely via `.push()` without bounded eviction (slice/shift) over time. This includes `toastService.svelte.ts`, `dataRepairService.ts`, `calculatorService.ts`, `marketWatcher.ts`, `trackingService.ts`, and `CandleChartView.svelte`. Additionally, `syntheticSubs` in WebSocket implementations needs rigorous teardown via `.clear()` in `destroy()` to prevent memory leaks.
- **Hot Paths**: High-frequency updates from WebSockets in `marketWatcher.ts` and chart updates can trigger unnecessary UI re-renders if reactivity isn't sufficiently debounced or optimized. Svelte 5 Runes help, but derived state calculations on large unbounded arrays can degrade performance.

### UI/UX & Accessibility (A11y)
- **Missing i18n Keys**: The usage of `throw new Error("apiErrors.invalidAmount")` and similar keys is good, but hardcoded fallback strings and literal error messages still exist in parts of the API routes and services.
- **Error Messages (Actionability)**: Raw API error messages are sometimes logged or surfaced without mapping to actionable localized keys, which can be unhelpful to users and leak infrastructure details.
- **Broken States**: Handling of offline or 500 API errors is currently rudimentary in some views, relying heavily on generic toast messages. A dedicated offline banner or "broken state" skeleton loader is needed in trading panels to prevent users from interacting with stale data.

### Security & Validation
- **Direct DOM Manipulations**: `MarkdownView.svelte` uses an unsafe `renderTrustedMarkdown` pattern that injects HTML directly via `{@html ...}`. This is a severe XSS vulnerability.
- **Input Validation**: Trade inputs are generally validated, but there is a lack of strict pre-validation (via Zod schemas) in some API endpoint parameters before being passed down to broker clients.

---

## Prioritized Findings

### 🔴 CRITICAL
- **XSS Vulnerability**: Unsafe direct DOM manipulation via `renderTrustedMarkdown` in `src/lib/windows/implementations/MarkdownView.svelte`. Must be replaced with the DOMPurify-backed `markdown` action (`renderSafeMarkdown`).
- **Precision Loss Risk**: Native float usage (`parseFloat`, `Number`) in critical financial paths (e.g., `src/services/mdaService.ts`, `src/routes/api/positions/+server.ts`). Must use `Decimal.js` for all price/quantity calculations.

### 🟡 WARNING
- **Memory Leaks**: Unbounded array `.push()` usage across multiple services and stores (e.g., `toastService.svelte.ts`, `marketWatcher.ts`, `dataRepairService.ts`) causing uncontrolled memory growth over time.
- **Hot Path Performance**: Unoptimized reactivity on high-frequency WebSocket data in `CandleChartView.svelte` and `MarketWatcher`.
- **UX/i18n**: Unmapped raw error messages and missing robust offline/broken state visual indicators in the trading UI.

### 🔵 REFACTOR
- **Type Safety in Error Handling**: Extensive usage of `catch (e: any)` across API routes and services (e.g., `syncService.ts`, `newsService.ts`, `dataRepairService.ts`). Bypasses TypeScript compiler safety.
- **API Response Parsing**: Inconsistent use of generic types rather than strict `Zod` schemas for `fetch` responses.

---

## Step 2: Action Plan

### 1. Fix Critical Vulnerabilities (Security & Precision)
- **Replace Unsafe Markdown Renderer**: Update `MarkdownView.svelte` to use Svelte action `use:markdown={win.content}`.
  - **Test Case (Unit Test)**: Create a Vitest test that injects `<img src=x onerror=alert(1)>` into the Markdown view store and asserts that the resulting DOM is sanitized (i.e., `onerror` attribute is removed) and does not execute JavaScript.
- **Migrate Native Floats to Decimal**: Replace all instances of `Number()` and `parseFloat()` with `new Decimal(val)` for price/quantity properties in `mdaService.ts` and `api/positions/+server.ts`.
  - **Test Case (Unit Test)**: Create a test validating that edge-case numbers with long mantissas (e.g., 0.0000000001) parse accurately and do not suffer from catastrophic cancellation or exponent notation stringification when sent to the API.

### 2. Resource Management Hardening
- **Bound State Growth**: Implement `.slice(-MAX_ITEMS)` or time-based eviction in all `.push()` operations identified in stores (`toastService.svelte.ts`, `marketWatcher.ts`, etc.).
- **WebSocket Teardown**: Audit `destroy()` methods to ensure all internal `Map` and `Set` properties (like `syntheticSubs`) explicitly call `.clear()`.

### 3. Error Handling & Stability Refactoring
- **Type-Narrow Catch Blocks**: Replace `catch (e: any)` with `catch (e: unknown)` and `e instanceof Error ? e.message : String(e)` project-wide.
  - **Justification**: Does this measurably improve stability or performance? Yes. It improves stability by preventing unexpected runtime crashes when non-Error objects are thrown (e.g., network timeout strings or objects), ensuring robust error logging.

### 4. Completeness & Verification
- **Run verification checks**: Execute `npm run check && npm run test` to verify all tests and Svelte checks pass with no regressions.
