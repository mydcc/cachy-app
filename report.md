# Code Analysis Report

## Critical Findings 🔴
1. `JSON.parse` is used improperly in multiple files. The project memory and standards dictate using `safeJsonParse` for API responses and payload strings to avoid precision loss on large 64-bit integers (common in crypto order IDs) and high-precision floats. Files using raw `JSON.parse`:
   - `src/services/apiService.ts`
   - `src/services/wasmCalculator.ts`
   - `src/services/apiQuotaTracker.svelte.ts`
   - `src/components/shared/ChartPatternsView.svelte`
   - `src/components/shared/GlobalTracker.svelte`
   - `src/components/shared/backgrounds/TradeFlowBackground.svelte`
   - `src/components/shared/ThreeBackground.svelte`
   - `src/utils/WasmTechnicalsCalculator.ts`

2. Rejections inside optimistic order handlers can leave data corrupted if not properly rolled back. The codebase memory states: "When handling backend API failures for optimistic UI operations (e.g., optimistic orders in omsService), always unconditionally roll back the local state (e.g., removeOrder(clientOrderId)) in the catch block to prevent phantom data, rather than leaving it in an indeterminate unconfirmed state." Currently in `src/services/tradeService.ts`, flashClose leaves it in `_isUnconfirmed = true` on non-terminal errors.

3. Unhandled unclosed resources when services are stopped (cleanup leaks). The codebase memory states: "While indiscriminate `.clear()` should be avoided during active operation, complete teardown methods (e.g., destroy()) must unconditionally call `.clear()` on all internal Map and Set collections (such as syntheticSubs or pendingSubscriptions) to ensure deterministic resource release and prevent memory leaks upon service disposal."
And also: "To prevent unbounded memory growth in caching Maps/Sets, implement bounded eviction strategies (e.g., size > limit). Crucially, when evicting from reference-counted Maps, do not blindly remove the first key via `.keys().next().value`. Iterate via `.entries()` to safely evict only inactive entries (e.g., val === 0) to prevent corrupting active application state."

4. Direct access to `.text()` followed by improper handling. The memory states: "When parsing text from a network response (await response.text()), always wrap the call in a try/catch block to safely handle stream reading errors or missing bodies, throwing a standardized localized error (e.g., apiErrors.invalidResponseFormat) on failure." And "Never expose raw response.statusText, non-JSON text() payloads, or API error rawMessage fields containing HTML to the UI or standard logs to prevent leaking sensitive gateway details or raw HTML."
Files using `.text()` without full try-catch or proper sanitization logic need inspection, especially `api/orders/+server.ts` and `tradeService.ts`. In `tradeService.ts` line 297, `rawMessage` might contain HTML. The instruction is to: "When extracting error messages for UI display (e.g., BitunixApiError.rawMessage), check if the string contains HTML (e.g., .toLowerCase().includes('<html')) and map it to a safe, localized error key like apiErrors.invalidResponse to prevent exposing raw proxy error pages via toastService."

## Warnings 🟡
1. Potential precision loss by using `Number()` or `parseFloat()` or `parseInt()` instead of `Decimal`. For instance, `parseInt` in `src/services/apiService.ts:393` and various array logic might bypass Decimal.js.
2. Missing i18n or using raw text when mapping.

## Refactor 🔵
1. Consolidate error handling for standard HTTP responses across API endpoints.


# Action Plan

## 1. Data Integrity & Precision Loss
- Replace `JSON.parse` with `safeJsonParse` in identified files.
- Ensure all instances of `parseInt`/`parseFloat` strictly related to amounts/prices are replaced with `Decimal` implementations.
- **Specific test case (for JSON.parse):** Create a test in `src/utils/tests/precision_loss.test.ts` that asserts `JSON.parse('{"id": 1234567890123456789}')` loses precision, whereas `safeJsonParse('{"id": 1234567890123456789}')` strictly returns `"1234567890123456789"` without rounding to `1234567890123456800`.

## 2. API Error Handling & Rejection Wrappers (Optimistic UI & text())
- Modify `tradeService.ts` error handlers:
  - Add logic to explicitly `omsService.removeOrder(clientOrderId)` instead of leaving `_isUnconfirmed` true for non-terminal errors in optimistic UI actions.
  - **Specific test case (for optimistic UI):** Add a test in `tradeService_safety.test.ts` to mock a non-terminal error (e.g. timeout) during `flashClosePosition` and verify `omsService.getOrder(clientOrderId)` returns undefined (removed) instead of unconfirmed.
  - Implement HTML detection on `e.rawMessage`. If `.toLowerCase().includes('<html')`, fallback to `apiErrors.invalidResponse`.
- Add `try/catch` wrappers around `.text()` calls in APIs and `apiService`.
- **Specific test case (for HTML parsing):** Mock an API failure returning HTML string in `BitunixApiError.rawMessage` and assert the error message shown to user is strictly `apiErrors.invalidResponse`.

## 3. Resource Management (Memory Leaks & Interval Types)
- Fix the typing of `setInterval` values to use `ReturnType<typeof setInterval>`.
- In eviction logic (like `apiService.ts` or `marketWatcher.ts`), modify Maps with ref counts to evict via `.entries()` checking for `0` instead of popping the first via `.keys()`.
- Add explicit `.clear()` inside all `destroy()` methods (e.g. WS implementations).

## 4. UI/UX & A11y (i18n & Error Mapping)
- Verify the existence of keys like `apiErrors.invalidResponse` and standardizing their usage instead of hardcoded raw string messages.

## Refactoring Justifications
- **Consolidate error handling for standard HTTP responses:** Does this measurably improve stability or performance? **Yes**. Standardizing error responses ensures the frontend never crashes on unexpected payload structures and strictly catches missing network issues, enhancing stability across edge cases.
- **Replacing Set/Map eviction via `.keys()` with `.entries()`:** Does this measurably improve stability or performance? **Yes**. Using `.keys()` to clear resources can mistakenly wipe active data causing data inconsistency; checking reference count via entries prevents silent application state corruption.
