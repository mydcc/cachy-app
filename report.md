# In-Depth Status & Risk Report (Phase 1) and Action Plan (Phase 2)

## Step 1: In-Depth Analysis & Report

### 🔴 CRITICAL: Risk of financial loss, crash, or security vulnerability

1. **Memory Leaks in `BitunixWebSocketService` Ping Timers**
   - **Finding:** In `src/services/bitunixWs.ts`, the `destroy()` method is missing `clearInterval` calls for `pingTimerPublic` and `pingTimerPrivate`, which are set using `setInterval()`. Furthermore, it doesn't clear `watchdogTimerPublic`, `watchdogTimerPrivate`, `reconnectTimerPublic`, or `reconnectTimerPrivate`. While `cleanup()` clears some of these, it is not unconditionally called in `destroy()`.
   - **Risk:** High memory leaks and CPU usage accumulation over time, especially during hot module reloads or when connections fail completely, creating zombie background ping timers.

2. **Uncaught HTML API Error Leak via `BitunixApiError.rawMessage` in `tradeService.ts`**
   - **Finding:** In `TradeService.flashClosePosition` and other API calls, if an indeterminate failure occurs (like a 502 Bad Gateway), the raw `response.text()` might be a proxy HTML page. Even though `safeJsonParse` is used, in the fallback catch block for `appFetch` and the `BitunixApiError` mapping, `rawMessage` can contain the raw HTML.
   - **Risk:** XSS vulnerability and leakage of proxy internals if raw HTML from a 502 error is passed to `toastService.error()` and rendered on the UI. The memory context mandates we check `.toLowerCase().includes('<html')` and map to `apiErrors.invalidResponse`.

3. **Loss of Precision due to Native Numbers in `ActiveTechnicalsManager` and `market.svelte.ts`**
   - **Finding:** In `src/services/activeTechnicalsManager.svelte.ts` and `src/stores/market.svelte.ts`, `price.toNumber()` is used inside `updateActiveTimeframes` and buffer updates to convert `Decimal` instances into native JavaScript numbers.
   - **Risk:** Severe precision loss on large 19-digit IDs and small fractional numbers representing cryptocurrency prices, violating the strict Decimal end-to-end requirement.

### 🟡 WARNING: Performance issue, UX error, missing i18n

1. **Missing i18n Translations in `tradeService.ts`**
   - **Finding:** Hardcoded strings are used in `TradeService.flashClosePosition`, such as `"Flash Close Failed"`. Although there's an attempt to fetch translations via `get(_)("trade.flashCloseFailed")`, the fallback string is hardcoded in English instead of using proper translation keys exclusively.
   - **Risk:** Suboptimal user experience for non-English speakers and localization inconsistencies.

2. **Missing `DOMPurify.sanitize()` in UI Components (XSS risk)**
   - **Finding:** Several UI components use Svelte's `{@html}` directive without sanitization (e.g. `src/components/shared/ToastItem.svelte` injecting `toast.type` icons, `src/components/results/SummaryResults.svelte` injecting `icons.lockClosed`, `src/components/settings/SettingsContent.svelte` for `tab.icon`).
   - **Risk:** While these currently appear to be hardcoded icons, bypassing `DOMPurify.sanitize()` when using `{@html}` poses a persistent XSS risk if any dynamic data is ever rendered through these vectors.

3. **Indeterminate State in `tradeService.ts` on Timeout (Broken State)**
   - **Finding:** The fallback for `flashClosePosition` in case of timeout correctly marks the optimistic order as `_isUnconfirmed = true` and triggers a background sync to recover. However, `closeAllPositions` does a pre-fetch and loop execution that doesn't fully reconcile individual indeterminate errors cleanly.
   - **Risk:** User sees "Flash Close Failed" but the order might have actually been executed on the exchange, causing state mismatch until background sync finishes.

### 🔵 REFACTOR: Code smell, technical debt

1. **Avoid Generic Error Types in `try/catch` Blocks**
   - **Finding:** Several places use `catch (e: any)` or throw generic `Error` instances without mapping them to structured `ApiError` types, which complicates deterministic error handling.
   - **Justification:** Implementing proper type-narrowing `catch (e: unknown)` and mapping `e instanceof Error` significantly improves API stability and avoids silent runtime crashes.

---

## Step 2: Action Plan (Implementation)

### Group 1: WebSocket & Service Lifecycle Hardening
*   **Fix:** Ensure all `setInterval` references in `bitunixWs.ts` (`pingTimerPublic`, `pingTimerPrivate`, `globalMonitorInterval`, etc.) are explicitly cleared via `clearInterval()` within the `destroy()` method.
*   **Tests:** Implement a test reproducing the missing `clearInterval` to verify zombie ping timers are cleaned up correctly upon service disposal.
*   **Justification:** Measurably improves client-side stability and eliminates unbounded memory leaks which crash long-running trading sessions.

### Group 2: Error Sanitization and i18n Fixes
*   **Fix:** Add strict `.toLowerCase().includes('<html')` checks in the API error handling (in `apiService.ts` and `tradeService.ts`). If HTML is detected, map the error string strictly to `apiErrors.invalidResponse`. Remove raw error payload exposure to the UI.
*   **Fix:** Replace hardcoded strings like `"Flash Close Failed"` in `tradeService.ts` with explicit `$_('key')` i18n usage, relying entirely on the translation files.
*   **Tests:** Introduce a mock test simulating a 502 Bad Gateway HTML proxy response and assert that the error returned is mapped safely without exposing raw HTML.
*   **Justification:** Closes a potential XSS vector through raw proxy messages and fulfills translation completeness for institutional compliance.

### Group 3: XSS Prevention in `{@html}` tags
*   **Fix:** Wrap all dynamic `{@html}` usages in components like `ToastItem.svelte`, `SettingsContent.svelte` and `SummaryResults.svelte` with `DOMPurify.sanitize()`.
*   **Justification:** Conforms to strict defense-in-depth principles against DOM-based XSS vulnerabilities.

### Group 4: Strict Decimal End-to-End
*   **Fix:** Update `ActiveTechnicalsManager.svelte.ts` and `market.svelte.ts` to retain `Decimal.js` instances inside their core loops instead of downcasting to floats via `.toNumber()`.
*   **Tests:** Implement a regression test injecting 19-digit number prices and small fractions to guarantee they are mathematically preserved without precision loss in the pipeline.
*   **Justification:** Directly prevents silent financial calculation errors related to large IDs and high-precision price values.
