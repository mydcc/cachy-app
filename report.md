## Code Analysis Report

### 🔴 CRITICAL

1.  **Memory Leak & Resource Management in MarketWatcher (`src/services/marketWatcher.ts`):**
    *   **Zombie Requests:** Uses `this.staggerTimeouts = new Set<ReturnType<typeof setTimeout>>()`. While timeouts are added, there might be paths where they aren't cleared upon cancellation or completion, leading to memory leaks over a long time.
    *   **Unbounded Maps:** Unclear if `requests` and `pendingRequests` maps are bound or properly pruned, causing unbounded growth.

2.  **Type Safety - Incorrect Error Catching (`catch (e: any)`):**
    *   Widespread use of `catch (e: any)` instead of `catch (e: unknown)`. Bypasses TypeScript and may cause crashes if `e.message` is accessed on an object that isn't an Error. Found in:
        *   `src/services/dataRepairService.ts`
        *   `src/services/syncService.ts`
        *   `src/services/newsService.ts`
        *   `src/services/activeTechnicalsManager.svelte.ts`
        *   `src/components/settings/tabs/CloudTab.svelte`
        *   `src/components/shared/sidepanel/NotesPanel.svelte`
        *   `src/components/shared/sidepanel/ChatPanel.svelte`
        *   `src/components/shared/sidepanel/AiPanel.svelte`
        *   `src/components/shared/TpSlList.svelte`
        *   `src/components/shared/JournalContent.svelte`
        *   `src/components/inputs/PortfolioInputs.svelte`
        *   `src/utils/storageHelper.ts`
        *   `src/utils/wasmTechnicals.ts`
        *   `src/stores/news.svelte.ts`
        *   `src/stores/ai.svelte.ts`
        *   `src/routes/api/tpsl/+server.ts`
        *   `src/routes/api/jules/+server.ts`
        *   `src/routes/api/rss-fetch/+server.ts`
        *   `src/routes/api/ai/anthropic/+server.ts`
        *   `src/routes/api/ai/gemini/+server.ts`
        *   `src/routes/api/external/news/+server.ts`
        *   `src/routes/api/balance/+server.ts`
        *   `src/routes/api/sync/positions-pending/+server.ts`
        *   `src/routes/api/sync/positions-history/+server.ts`
        *   `src/routes/api/sync/order-detail/+server.ts`
        *   `src/routes/api/sync/+server.ts`
        *   `src/routes/api/positions/+server.ts`
        *   `src/routes/+layout.svelte`
        *   `src/lib/windows/implementations/AssistantView.svelte`
        *   `src/lib/server/chatStore.ts`

3.  **Use of `any` across the Codebase:**
    *   Many instances of `any` found in `src/services/engineBenchmark.test.ts`, `src/services/webGpuCalculator.ts`, `src/services/dataRepairService.ts`, `src/services/workerPool.ts`, etc. Should be replaced with `unknown` and narrowed for safety.

4.  **Floating point inaccuracies (Decimal vs Number):**
    *   Need to ensure `Decimal.js` is used everywhere for financial calculations to prevent precision loss. E.g. in `tradeService.ts`, some places like `(result as any)[category] = {}` might be vulnerable.

5.  **Missing Error i18n & HTML Exposure:**
    *   Raw errors (e.g., `BitunixApiError.rawMessage`) might contain HTML from a 502/504 gateway response and should not be shown directly in `toastService`. Must map to a generic UI string.

### 🟡 WARNING

1.  **Missing i18n Keys / Hardcoded Strings:**
    *   Various hardcoded errors or strings instead of using standard i18n mechanisms, e.g. `String(data.error).includes("code: 2")` in `src/services/tradeService.ts`.

2.  **Performance Hot Paths:**
    *   Updates in high frequency data channels (e.g., MarketWatcher `register`/`unregister`) should be optimized to prevent unnecessary UI renders or performance bottlenecks.

### 🔵 REFACTOR

1.  **Serialization and deserialization:** Use `safeJsonParse` everywhere.
2.  **Strictly replace `JSON.parse`:** Found instances of `JSON.parse` which should be replaced by `safeJsonParse`.

## Step 2: Action Plan

1.  **Refactor Error Throwing & i18n (`tradeService.ts`, `dataRepairService.ts`, etc.)**
    *   **Justification:** Measurably improves stability by replacing generic strings with centralized constants (`TRADE_ERRORS`) that have defined mapping to safe, localized error keys, mitigating the exposure of raw proxy HTML proxy responses via `toastService`.

2.  **Strict Type Safety: Eliminate `catch (e: any)`**
    *   **Justification:** Measurably improves stability by preventing bypass of TypeScript compiler checking, protecting the app from unhandled exceptions when checking `e.message` on a non-Error.
    *   **Unit test suggestion (for `dataRepairService.ts`):**
        ```typescript
        import { it, expect } from 'vitest';
        import { dataRepairService } from './dataRepairService';
        it('should safely handle non-Error objects thrown in data repair routines', async () => {
            // Mock dependency to throw a string instead of an Error object
            // Verify dataRepairService does not crash and handles the error gracefully
            // by asserting on the log output or returned status
        });
        ```
    *   Find all occurrences of `catch (e: any)` across the application.
    *   Replace with `catch (e: unknown)` and narrow the error safely using `const errorMsg = e instanceof Error ? e.message : String(e);`.

3.  **Harden WebSocket / Subscriptions & Memory Leaks in `marketWatcher.ts`**
    *   **Justification:** Measurably improves performance and prevents memory leaks that would otherwise degrade stability under high frequency update scenarios.
    *   **Unit test suggestion:**
        ```typescript
        import { it, expect } from 'vitest';
        import { marketWatcher } from './marketWatcher';
        it('should correctly clear stagger timeouts on unregister', () => {
             // Register a channel to trigger a timeout
             // Call unregister
             // Verify that staggerTimeouts Set is empty
        });
        ```
    *   Bound caching dictionaries / lists with timestamp evictions or size limits, specifically `prunedRequestIds` and timeouts inside `staggerTimeouts`.

4.  **Enforce Decimal Precision**
    *   **Justification:** Measurably improves financial transaction stability by guaranteeing that floating-point operations use `Decimal.js` explicitly for order quantity and price amounts rather than generic primitives or generic TypeScript interfaces that hide precision loss.
    *   **Unit test suggestion:**
        ```typescript
        import { it, expect } from 'vitest';
        import { tradeService } from './tradeService';
        it('should strictly use Decimal.js and avoid Number precision loss during closePosition', async () => {
            // Mock OMS position with 19-digit precision quantity
            // Verify payload sent to API retains precision as string/Decimal and is not truncated to float
        });
        ```

5.  **Verify & Test Fixes**
    *   Run `npm run check && npm run test` to guarantee no regressions exist in the codebase, fulfilling the explicit rule required.

6.  **Pre-commit steps**
    *   Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
