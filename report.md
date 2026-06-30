# Code Analysis & Risk Report (Institutional Grade)

## Status Quo & Vulnerabilities (Step 1)

### 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)
1. **Precision Loss (`activeTechnicalsManager.svelte.ts`)**: The method `price.toNumber()` is being used to convert `Decimal` back to native JavaScript floats. This causes floating-point precision loss in financial calculations.
2. **Precision Loss (`JSON.parse`)**: There are 51 instances of native `JSON.parse` across critical files (e.g., `tradeService_flashClose.test.ts`, `backupService.ts`, `apiService.ts`, stores). For large 64-bit integer IDs (like order IDs) and high-precision floats, `JSON.parse` silently truncates data. `safeJsonParse` should be used instead.
3. **Memory Leaks (`Map`/`Set` Eviction)**: `apiService.ts`, `rss-fetch/+server.ts`, and `news/+server.ts` blindly evict the first key from caches using `.keys().next().value`. In reference-counted Maps or active maps, removing the first key without checking if it's currently active/in-use corrupts state and leads to unpredictable bugs.
4. **XSS Vulnerabilities (`{@html}` without `DOMPurify`)**: Several Svelte components render dynamic content using `{@html}` without wrapping it in `DOMPurify.sanitize()`, exposing the app to Cross-Site Scripting (XSS). Examples: `SummaryResults.svelte`, `SettingsContent.svelte`, `DashboardNav.svelte`, `ChartPatternsView.svelte`, `ToastItem.svelte`, `MarketOverview.svelte`, `NewsSentimentPanel.svelte`, `SidePanel.svelte`, `OrderDetailsTooltip.svelte`, `JournalContent.svelte`, `LeftControlPanel.svelte`.
5. **Raw API Errors / HTML Leaks**: The `rawMessage` field from `BitunixApiError` is used directly for UI display via `tradeService.ts`, `PositionsSidebar.svelte`, and `TpSlEditModal.svelte`. If an API gateway returns a 502/504 HTML error page, this raw HTML is currently injected or displayed to the user. It must be checked for HTML content and mapped to a safe i18n key (e.g., `apiErrors.invalidResponse`).
6. **Type Safety Bypass (`catch (e: any)`)**: There are 16 instances of `catch (e: any)` in the codebase (e.g., in `api/ai/anthropic/+server.ts`, `api/ai/gemini/+server.ts`, `api/external/cmc/+server.ts`, `api/external/news/+server.ts`, `api/sync/positions-pending/+server.ts`, etc.). This circumvents TypeScript and leads to runtime crashes when trying to access `e.message` on non-Error objects. Must use `catch (e: unknown)`.

### 🟡 WARNING (Performance issue, UX error, missing i18n)
1. **Zombie Timers (Intervals/Timeouts)**: The codebase heavily utilizes `setInterval` and `setTimeout`. In Svelte 5 and stores (e.g., `market.svelte.ts`, `chat.svelte.ts`, `activeTechnicalsManager.svelte.ts`, `apiService.ts`), if these are not strictly cleaned up in a `destroy()` or `$effect` cleanup block, they cause memory leaks and background CPU drain ("zombie polling"). A thorough audit of cleanup routines (`clearInterval`, `clearTimeout`) is required.
2. **Missing i18n (Hardcoded Strings)**: Fallback error messages in `catch` blocks (e.g., `"Internal Server Error"`, `"Failed to fetch balance"`) are hardcoded in English instead of using the translation system.
3. **Optimistic UI Rollbacks**: When network timeouts occur during optimistic UI operations (like placing an order), unconditionally removing the unconfirmed order locally can lead to accidental double-ordering if the exchange actually executed it. Orders should be marked as `_isUnconfirmed = true` instead.

### 🔵 REFACTOR (Code smell, technical debt)
1. **Consistent Timer Types**: Ensure all timer IDs are strictly typed as `ReturnType<typeof setInterval>` and `ReturnType<typeof setTimeout>` rather than `any` or `number` for cross-environment safety.
2. **Temporary Script Cleanup**: The repository has multiple temporary `.cjs`, `.mjs`, `.js`, and `.py` scripts scattered in the root directory (e.g., `fix_test.cjs`, `patch_news_final_clean.js`, `fix_registry_journal.py`). These should be moved to a `scripts/` folder or deleted if no longer needed.


## Action Plan (Step 2)

### Group 1: Data Integrity & Math Hardening (CRITICAL)
**Justification**: Measurably improves stability by preventing incorrect financial calculations and broken state.
* **Action**: Replace `price.toNumber()` in `activeTechnicalsManager.svelte.ts` with explicit `Decimal` logic.
* **Action**: Replace all critical instances of `JSON.parse` with the `safeJsonParse` utility.
* **Unit Test**: Provide a test demonstrating precision loss with `JSON.parse` on large IDs (e.g. `9007199254740992`).

### Group 2: Security & Type Safety (CRITICAL)
**Justification**: Prevents Cross-Site Scripting (XSS) and hard runtime crashes due to typing bypasses.
* **Action**: Wrap all dynamic `{@html}` usages in Svelte components with `DOMPurify.sanitize()`.
* **Action**: Fix `BitunixApiError.rawMessage` usage to parse HTML responses and map to i18n keys (e.g., `apiErrors.invalidResponse`).
* **Action**: Replace all instances of `catch (e: any)` with `catch (e: unknown)` and properly type-narrow `e instanceof Error ? e.message : String(e)`.
* **Unit Test**: Test Svelte component rendering with malformed HTML to ensure XSS tags are stripped. Test error handling throwing non-Error objects.

### Group 3: Memory & Resource Management (CRITICAL / WARNING)
**Justification**: Measurably improves performance and prevents memory leaks that crash the platform during long trading sessions.
* **Action**: Refactor cache eviction in maps using `.keys().next().value` to use `.entries()` and safely evict inactive entries (e.g. checking activity).
* **Action**: Audit timer lifecycle and ensure robust cleanup of `setInterval` and `setTimeout`. Strongly type timers as `ReturnType<typeof ...>`.
* **Unit Test**: Simulate rapid caching to ensure memory remains bounded and evicts correctly.

### Group 4: UI/UX State (WARNING)
**Justification**: Enhances user experience during failure states.
* **Action**: Replace hardcoded error strings in `catch` blocks with centralized i18n translation keys.
* **Action**: Adjust optimistic UI execution to mark unconfirmed orders (e.g., `_isUnconfirmed = true`) instead of fully rolling back on timeout.
