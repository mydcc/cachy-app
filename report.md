# In-Depth Status & Risk Report

## 🔴 CRITICAL: Risk of financial loss, crash, or security vulnerability

*   **Financial Standards Violation (Decimal.js vs. Native Floats)**:
    *   The `src/services/activeTechnicalsManager.svelte.ts` file contains unsafe conversions from `Decimal` to native JavaScript floats using `.toNumber()` or `Number()`. This violates the strict rule of maintaining `Decimal` end-to-end to prevent precision loss.
*   **Security (Unsanitized {@html} usage)**:
    *   Several Svelte components use `{@html}` without explicitly wrapping the content in `DOMPurify.sanitize()`. This presents a risk for Cross-Site Scripting (XSS) if the data source isn't trusted.
        *   Affected files include: `src/components/results/SummaryResults.svelte`, `src/components/settings/SettingsContent.svelte`, `src/components/shared/AnalyticsButton.svelte`, `src/components/shared/ChartPatternsView.svelte`, `src/components/shared/DashboardNav.svelte`, `src/components/shared/DisclaimerModal.svelte`, `src/components/shared/JournalContent.svelte`, `src/components/shared/LeftControlPanel.svelte`, `src/components/shared/MarketDashboardModal.svelte`, `src/components/shared/MarketOverview.svelte`, `src/components/shared/NewsSentimentPanel.svelte`, `src/components/shared/OrderDetailsTooltip.svelte`, `src/components/shared/SidePanel.svelte`, `src/components/shared/ToastItem.svelte`, `src/components/shared/journal/JournalFilters.svelte`, `src/lib/windows/implementations/DialogView.svelte`, `src/lib/windows/implementations/MarkdownView.svelte`, `src/lib/windows/implementations/SymbolPickerView.svelte`, `src/routes/+layout.svelte`, `src/routes/+page.svelte`, `src/routes/[[lang]]/(seo)/+layout.svelte`.
*   **Data Integrity (JSON parsing)**:
    *   Many files still use native `JSON.parse()` instead of the custom `safeJsonParse` utility. This poses a severe risk of silent precision loss with large numeric IDs and unhandled parsing exceptions.
        *   Affected files include: `src/services/apiQuotaTracker.svelte.ts`, `src/services/backupService.ts`, `src/services/mappers.ts`, `src/stores/settings.svelte.ts`, `src/stores/notes.svelte.ts`, `src/stores/quiz.svelte.ts`, `src/stores/ai.svelte.ts`, `src/stores/indicator.svelte.ts`, `src/stores/favorites.svelte.ts`, `src/utils/fastConversion.ts`, `src/routes/api/sync/orders/+server.ts`, `src/routes/api/ai/gemini/+server.ts`, `src/routes/api/sentiment/+server.ts`.

## 🟡 WARNING: Performance issue, UX error, missing i18n

*   **Resource Management (Memory Leaks)**:
    *   **Unclosed WebSocket subscriptions**: `src/services/bitgetWs.ts` is missing a `.clear()` call in its teardown/destroy method. Collections (like `syntheticSubs` or `pendingSubscriptions`) must be cleared to prevent memory leaks on service disposal.
    *   **Unbounded arrays in stores**: `src/stores/account.svelte.ts` has multiple `.push()` calls on its collections (like `positions`, `openOrders`, `assets`) without an obvious bounded eviction strategy (e.g. slicing or popping when length exceeds a limit).

## 🔵 REFACTOR: Code smell, technical debt

*   (No massive technical debt items that strictly compromise stability were identified beyond the critical and warning items above).

## Step 2: Action Plan

### 1. Fix Decimal.js Precision Downcasting
*   **Target:** `src/services/activeTechnicalsManager.svelte.ts`
*   **Action:** Refactor `.toNumber()` and `Number()` conversions to use `Decimal` directly. Adjust types to accept `Decimal` where necessary.
*   **Justification:** Does this measurably improve stability? Yes. Preventing downcasting from `Decimal` to float is an institutional-grade requirement to avoid silent precision loss in price/quantity calculations, eliminating the risk of incorrect financial states or rejected API orders.
*   **Test Case Proposal:** Add a unit test feeding extremely small/large decimal values (e.g., `0.00000000000000000123`) to `activeTechnicalsManager` and assert that the internal representations and outputs retain full precision exactly matching `Decimal('0.00000000000000000123')`, verifying no float rounding occurred.

### 2. Harden WebSocket Memory Management (Teardown)
*   **Target:** `src/services/bitgetWs.ts`
*   **Action:** Add `.clear()` calls for all internal `Map` and `Set` collections inside the teardown/destroy method.
*   **Justification:** Does this measurably improve performance/stability? Yes. Ensuring explicit memory release prevents unbounded memory growth across reconnection lifecycles, critical for long-running high-frequency trading clients.

### 3. Enforce Safe JSON Parsing
*   **Target:** All identified files using `JSON.parse()` natively (e.g., `src/services/apiQuotaTracker.svelte.ts`, `src/services/backupService.ts`, `src/services/mappers.ts`, etc.)
*   **Action:** Replace all instances of `JSON.parse(...)` with `safeJsonParse(...)` and import the utility correctly. Ensure proper type-narrowing handles parsing exceptions.
*   **Justification:** Does this measurably improve stability? Yes. Large numeric IDs (e.g., 64-bit exchange order IDs) can lose precision silently in native `JSON.parse()`. `safeJsonParse` guarantees precision and fails safely, preventing silent data corruption in mission-critical synchronization paths.

### 4. Mitigate Unbounded Memory Growth in Stores
*   **Target:** `src/stores/account.svelte.ts`
*   **Action:** Introduce a bounded eviction strategy (e.g., limit history/arrays to a max size) or use `Map` structures to replace outdated entries rather than continually pushing to `openOrders`, `positions`, or `assets`.
*   **Justification:** Does this measurably improve performance? Yes. Unbounded arrays eventually lead to UI thread lag and memory exhaustion in active trading sessions with frequent state updates.

### 5. Secure {@html} Tags against XSS
*   **Target:** All Svelte files with unsanitized `{@html}` tags.
*   **Action:** Wrap all inputs for `{@html}` blocks with `DOMPurify.sanitize(...)`.
*   **Justification:** Does this measurably improve stability? Yes. It patches high-severity XSS attack vectors. Since we cannot fully trust dynamic backend responses or API error messages, this eliminates the risk of executing injected malicious scripts.
