# In-Depth Analysis & Status Report

## Data Integrity & Mapping

*   **Decimal.js Usage vs Native Numbers**:
    *   **🔴 CRITICAL**: Found instances in `src/services/tradeService.ts` where native numbers are used instead of `Decimal`. While some parts use `Decimal.js`, ensuring end-to-end usage is crucial for precise financial calculations. Specifically, `new Decimal(0)` and explicit serialization handling are present, but native floats might still leak.
*   **JSON Parsing and Precision Loss**:
    *   **🔴 CRITICAL**: `JSON.parse` is extensively used across the codebase instead of the custom `safeJsonParse` utility. This poses a significant risk for precision loss, especially with large IDs or financial values. Affected areas include API responses, backups, and store initializations (`src/services/apiService.ts`, `src/stores/market.svelte.ts`, `src/stores/account.svelte.ts`).

## Resource Management & Performance

*   **WebSocket Subscriptions**:
    *   **🟡 WARNING**: WebSocket subscription management (`src/services/marketWatcher.ts`, `src/services/bitgetWs.ts`) shows unsubscription logic (`subscriptions.set(subKey, currentCount - 1)`), but there might be edge cases leading to memory leaks if connections drop unexpectedly without properly clearing the subscriptions Map. The `.delete` calls in `marketWatcher.ts` seem robust, but thorough testing is required.
*   **Unbounded Arrays in Stores**:
    *   **🔴 CRITICAL**: Several stores use unbounded arrays via `.push`, which can lead to memory exhaustion over time. E.g., `src/stores/journal.svelte.ts` (`entries.push`), `src/stores/floatingWindows.svelte.ts` (`windows.push`), and critically, `src/stores/market.svelte.ts` where `dedupedRaw.push` and `history.push` are used without apparent bounds checking in the immediate context.

## UI/UX & Accessibility (A11y)

*   **Missing i18n Keys**:
    *   **🟡 WARNING**: Hardcoded strings were found in components, bypassing the i18n system. Examples include `src/components/settings/tabs/IndicatorSettings.svelte` ("Panel Configuration", "Summary", "Oscillators", etc.) and `src/components/settings/EngineDebugPanel.svelte`. This affects localization and accessibility.
*   **Error Messages & Broken States**:
    *   **🟡 WARNING**: Need to ensure all raw error messages (like HTML error pages from proxies) are caught and replaced with safe, actionable, localized user messages (e.g., `apiErrors.invalidResponse`) rather than raw `statusText`.

## Security & Validation

*   **Unsafe DOM Manipulation**:
    *   **🔴 CRITICAL**: The codebase uses `{@html}` heavily (55 instances). While some use `DOMPurify.sanitize` (e.g., `src/components/settings/HotkeySettings.svelte`), others like `{@html sanitizeHtml(win.message)}` or direct icon injections need verification to ensure no user-controlled input bypasses sanitization, risking XSS.
*   **Input Validation**:
    *   **🟡 WARNING**: Order quantities and prices should be strictly validated before being sent to the API, ideally utilizing `Decimal` types for all checks to prevent rounding exploits or NaN errors.

## Prioritized Findings

### 🔴 CRITICAL

1.  **JSON.parse Precision Loss**: Pervasive use of native `JSON.parse` instead of `safeJsonParse` risks corrupting 64-bit integers and financial data.
2.  **Unbounded Arrays (Memory Leaks)**: Stores like `market.svelte.ts` and `journal.svelte.ts` append data indefinitely without enforced limits.
3.  **Inconsistent Decimal Usage**: Native numbers leaking into `tradeService.ts` or calculations, risking financial inaccuracies.
4.  **XSS Risks with `{@html}`**: Ensure all dynamic content rendered via `{@html}` is strictly sanitized.

### 🟡 WARNING

1.  **Missing i18n**: Hardcoded text in UI components (`IndicatorSettings.svelte`, etc.).
2.  **WebSocket Edge Cases**: Ensure all temporary subscriptions are fully cleared on connection drops.
3.  **Raw Error Exposure**: Ensure proxy errors (HTML) aren't shown in toasts.

### 🔵 REFACTOR

1.  **Store Consolidation**: Review store initialization to ensure bounds checking is uniformly applied.
## Step 2: Action Plan (Implementation)

Based on the findings, here is the prioritized action plan for the implementation phase:

### 1. Data Integrity & Mapping (🔴 CRITICAL)
*   **JSON.parse Mitigation**:
    *   Find all instances of `JSON.parse` across the application, especially in `apiService.ts`, stores, and data loading mechanisms.
    *   Replace them with the custom `safeJsonParse` utility to prevent silent precision loss with large integers (e.g., order IDs) and high-precision floats.
*   **Decimal.js Enforcement**:
    *   Audit `src/services/tradeService.ts`, `activeTechnicalsManager.svelte.ts`, and relevant math utilities.
    *   Replace instances where `Decimal` is downcast to a float via `.toNumber()` or `Number()`.
    *   **Test Case**: Provide a unit test simulating API payloads with 19-digit numbers or high-precision floats and verifying they map safely to `Decimal` without intermediate floats.

### 2. Resource Management & Performance (🔴 CRITICAL)
*   **Unbounded Stores and Memory Leaks**:
    *   Implement bounded eviction strategies in stores like `market.svelte.ts` (kline history arrays), `journal.svelte.ts` (`entries.push`), and `floatingWindows.svelte.ts`. For maps/sets, evict by checking reference counts securely (iterating via `.entries()`, not just blindly taking the first key).
    *   **Test Case**: Provide a unit test that continuously pushes data to `market.svelte.ts` beyond the defined limit, asserting that the size remains constrained to the maximum bound (e.g., 5000 entries).
*   **WebSocket Hardening**:
    *   Ensure teardown methods (e.g., `destroy()`) in `bitgetWs.ts` and `marketWatcher.ts` strictly call `.clear()` on all maps (`pendingSubscriptions`, `requests`, etc.).
    *   **Test Case**: Provide a test simulating a disconnect event and verifying all pending requests and interval timers are cleanly disposed of.

### 3. UI/UX & A11y (🟡 WARNING)
*   **All i18n Fixes**:
    *   Extract hardcoded strings in `IndicatorSettings.svelte` and `EngineDebugPanel.svelte` into the translation system (e.g., mapping "Summary" to `settings.indicator.summary`).
*   **Raw Error Obfuscation**:
    *   Audit API error catch blocks. Detect HTML or raw `statusText` in error messages (e.g., `BitunixApiError.rawMessage`) and map to `apiErrors.invalidResponse` before bubbling to `toastService`.

### 4. Security & Validation (🔴 CRITICAL)
*   **DOMPurify Audit (`{@html}`)**:
    *   Wrap all missing `{@html}` tags displaying dynamic or API-sourced content with `DOMPurify.sanitize()` to close potential XSS vectors. Direct trusted icons are acceptable but must be reviewed.
*   **Strict Error Catching**:
    *   Replace any `catch (e: any)` with `catch (e: unknown)` and narrow properly (`e instanceof Error ? e.message : String(e)`).

### Refactoring Justification
*   Changes proposed strictly improve *stability* (preventing out-of-memory crashes via bounded arrays, preventing data corruption via `safeJsonParse`) and *performance* (resource release in WebSockets). Cosmetic changes are omitted.
