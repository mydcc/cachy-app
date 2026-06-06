# In-Depth Status & Risk Report (Cachy-App)

## 1. Data Integrity & Mapping

🔴 **CRITICAL:** Use of `JSON.parse` instead of `safeJsonParse`.
- Several locations parse API responses or backups with `JSON.parse`. This can silently corrupt 19-digit numerical IDs (precision loss) frequently seen in crypto APIs.
- *Examples:* `src/services/apiQuotaTracker.svelte.ts`, `src/services/backupService.ts`, `src/services/wasmCalculator.ts`.
- *Fix:* Replace `JSON.parse` with `safeJsonParse` and wrap in `try/catch` block.

🔴 **CRITICAL:** Invalid Type Assertions / Any Types.
- Many places in tests and input handling utilize `any`, circumventing TypeScript's safety mechanisms. The `catch (e: any)` pattern is prevalent in `src/services/dataRepairService.ts`, `src/services/syncService.ts`, `src/services/newsService.ts`, `src/components/settings/tabs/CloudTab.svelte`, and `src/components/inputs/PortfolioInputs.svelte`.
- *Fix:* Update all `catch` blocks to `catch (e: unknown)` and narrow the type using `e instanceof Error ? e.message : String(e)`.

🟡 **WARNING:** Decimals downcasted to Floats.
- Discovered `.toNumber()` calls on Decimals in `src/services/activeTechnicalsManager.svelte.ts` (`price.toNumber()`) and `src/components/inputs/TradeSetupInputs.svelte`.
- *Fix:* Ensure all end-to-end price calculations retain the Decimal type. Do not use `.toNumber()` or `Number(price.toString())`.

## 2. Resource Management & Performance

🔴 **CRITICAL:** Missing Cleanup of Intervals and Subscriptions.
- Found potential interval memory leaks in `src/components/settings/EngineDebugPanel.svelte` and `src/components/shared/CalculationDashboard.svelte`. These might cause background processing to continue indefinitely after component unmount.
- *Fix:* Explicitly clear all intervals in `onDestroy` hooks.

🟡 **WARNING:** Unbounded caching / Collections
- Inspect Maps, Sets, and Stores in services for missing limits/evictions to avoid OOM errors under high update frequencies.

## 3. UI/UX & Accessibility (A11y)

🟡 **WARNING:** Svelte Lifecycle Hook syntax.
- Found raw `<script>` string checks during static analysis indicating potential Svelte scripts/hooks misplacements. Ensure Svelte hooks like `onDestroy` always live strictly within the component's `<script>` tags.

🟡 **WARNING:** Unhandled Text Parsing / Raw Strings.
- `response.text()` responses often not wrapped in `try/catch`. This can expose raw proxy HTML if the backend responds with a 502/504 string rather than a valid JSON object.
- *Fix:* Ensure all `.text()` parsers or raw messaging use strict error boundary wrappers and display fallback localization strings instead of raw proxy messages.

## 4. Security & Validation

🔴 **CRITICAL:** Insufficient Input Validation & Unknowns.
- Need strict `unknown` handling with Zod parsing (or safe object checking) for API outputs, particularly around `TradeService` operations (like TpSl requests). Directly casting outputs as specific types risks crashes on unexpected properties.

---

# Action Plan

## Group 1: Hardening Types & Error Handling
1. Replace `catch (e: any)` with `catch (e: unknown)` and implement type-narrowing across all identified services (`newsService.ts`, `dataRepairService.ts`, `syncService.ts`) and components.
2. Ensure strict error message conversions using `String(e)` instead of generic casts.

## Group 2: Fixing Data Integrity (JSON & Decimals)
1. Replace `JSON.parse` with `safeJsonParse` in all application service files (excluding test mocks where applicable, but generally uniformly).
2. Remove `.toNumber()` calls on Decimals in `activeTechnicalsManager.svelte.ts` and `TradeSetupInputs.svelte`. Refactor the corresponding logic to operate directly on `Decimal` objects.
3. *Critical Test Case:* Write a unit test verifying `activeTechnicalsManager.svelte.ts` correctly processes large Decimals without precision loss during price updates.

## Group 3: Memory Leaks & Resource Management
1. Fix interval memory leaks in `EngineDebugPanel.svelte` and `CalculationDashboard.svelte` by verifying/adding clear mechanisms in `onDestroy` (within `<script>` tags).
2. Review and patch unclosed subscriptions or unbounded arrays in global stores/services if applicable (specifically check `syntheticSubs` size limit and iteration during eviction).

## Group 4: Network & Response Resilience
1. Wrap `response.text()` calls in `try/catch` and catch/map parsing failures to localized keys (e.g., `apiErrors.invalidResponseFormat`).
2. Add safe JSON parsing checks to API responses handling unknown dynamic properties. Ensure HTML error strings from gateways are intercepted.

*Justification:* These targeted fixes ensure strict data integrity, eliminate silent OOM memory leaks on long-running tabs, prevent API error crashes, and uphold high-frequency-trading reliability. Pure cosmetic changes have been omitted.
