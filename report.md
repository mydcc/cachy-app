# Codebase Analysis Report

## 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1.  **Missing `{@html}` Sanitization**: Some `{@html}` usages in the Svelte components lack `DOMPurify.sanitize()`, posing a potential XSS risk if user-controlled or API-driven data is rendered (e.g., icons, patterns, icons based on categories). Found in `ChartPatternsView.svelte`, `MarketOverview.svelte`, `LeftControlPanel.svelte`, `SidePanel.svelte`, etc.
2.  **`TradeService` Precision Loss**: In `TradeService`, order quantities/prices are converted via `toString()` then implicitly converted by the API client, but the system must guarantee `Decimal` everywhere. It uses native numbers for some tests, and there are many places where `Number(...)` or `parseFloat(...)` are being used on API data instead of keeping it strictly as Decimal until serialization.
3.  **`JSON.parse` Data Corruption Risk**: Widespread use of native `JSON.parse` for API responses and storage deserialization. Large numerical IDs and exact token amounts might silently lose precision. `safeJsonParse` utility should be enforced universally.
4.  **Improper Error Object Mapping**: Error catching with `catch (e: any)` bypasses TypeScript's strict checks and is scattered throughout the application (`newsService.ts`, `dataRepairService.ts`, API handlers). Needs to use `catch (e: unknown)` and proper narrowing.
5.  **`MarketWatcher` Missing Teardown of Maps**: The `destroy()` method is missing full map clearing. To prevent memory leaks, `Map`/`Set` variables must be actively cleared instead of hoping the garbage collector kicks in, especially important if the service instance is replaced/disposed.
6.  **`TradeService` Flash Close Optimization (Logic Error)**: The flash close function creates optimistic UI updates. If an indeterminate network timeout occurs, it blindly assumes failure. It needs robust handling where unconfirmed orders are kept as unconfirmed (`_isUnconfirmed = true`) so that a real execution doesn't cause a double-trade upon naive retry.

## 🟡 WARNING (Performance issue, UX error, missing i18n)

1.  **Missing I18n Wrappers in TpSlList**: In `TpSlList.svelte`, `error = $_("dashboard.alerts.cancelFailed")` mapping is hardcoded instead of checking the `rawMessage` appropriately. Also, various UI displays might throw raw internal strings to the user if the server sends back unhandled exception messages.
2.  **Unbounded Arrays / Maps**: Some caches lack strict bounds, like arrays in indicators or some tracking sets. We observed `prunedRequestIds` bounded, but `staggerTimeouts` and `requests` may grow unbounded under specific extreme fetch storm cases.
3.  **Use of `parseFloat` in Fast Paths**: In `fastConversion.ts` and `csvService.ts`, `parseFloat` is used heavily, which can compromise the strict requirement to stick to Decimals.

## 🔵 REFACTOR (Code smell, technical debt)

1.  **Consolidate Error Types**: Consolidate error handling and API mapping down to `unknown` checks. Improves stability and ensures typed extraction.
2.  **Centralize `DOMPurify` Usage**: Enforce a central UI sanitization pipe.

## Step 2: Implementation Plan

### Group 1: Security & Defensive Programming (CRITICAL)
- **Sanitize `{@html}` Directives**: Review all files identified with `grep -rn '{@html'` and strictly enforce `DOMPurify.sanitize()` where dynamic output is injected into the DOM.
- **Type-Safe Error Catching**: Replace `catch (e: any)` with `catch (e: unknown)` globally in critical services (`TradeService`, `MarketWatcher`, `NewsService`) and narrow the error manually (e.g., `e instanceof Error`).
- **Precision Preservation**: Ban native `JSON.parse` in `TradeService` and local storage loads; switch to `safeJsonParse` (if it exists) or a precision-safe parsing strategy to avoid losing 64-bit precision.
- **Flash Close Fallback Strategy**: Update `TradeService.ts` for optimistic updates. If the cancel/close request throws a network timeout, keep the optimistic order alive with an `_isUnconfirmed: true` flag rather than aggressively rolling it back.

*Proposed Unit Test for Flash Close Issue:*
```typescript
it("should keep optimistic order marked unconfirmed if API times out", async () => {
    // 1. Mock API to throw a TimeoutError.
    // 2. Call tradeService.closePosition.
    // 3. Assert the optimistic order remains in omsService but has _isUnconfirmed = true.
});
```

### Group 2: Hardening & Resource Management (CRITICAL/WARNING)
- **Memory Leak Prevention in `MarketWatcher`**: In `MarketWatcher.ts`, update the `destroy()` method to aggressively iterate and clear all `Map`s and `Set`s (e.g., `pendingRequests`, `staggerTimeouts`, etc.) to prevent uncollectable allocations.
- **Decimal Policy Enforcement**: Scrub `parseFloat` and `Number()` downcasts within `activeTechnicalsManager.svelte.ts` and `TradeService.ts` when processing price/quantity. Maintain `Decimal` types up to the final JSON stringification border.

*Proposed Unit Test for Memory Leak Issue:*
```typescript
it("should fully release memory allocations on destroy()", () => {
    // 1. Seed MarketWatcher with active requests and timeouts.
    // 2. Call destroy().
    // 3. Assert pendingRequests.size === 0, staggerTimeouts.size === 0, etc.
});
```

### Group 3: I18n & Error Mapping (WARNING)
- **User-Facing API Errors**: Ensure any error messages passed to `toastService` or bound to UI error variables use `mapApiErrorToLabel` and pass through `$_()` correctly. Do not blindly expose `.rawMessage` if it contains unparsed backend HTML (XSS/UX leak). Filter out `<html>` and generic fallback to `apiErrors.invalidResponse`.
