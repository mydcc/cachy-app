# Analysis Report: Cachy-App Codebase Audit

## 1. Executive Summary
The codebase demonstrates a solid foundation with advanced features like "Fast Path" WebSocket handling, "Hybrid Architecture" for market data, and extensive use of `Decimal.js` for financial calculations. However, there are significant risks in Internationalization (I18n), potential memory leaks in event listeners, and loose validation in some API endpoints.

## 2. Findings

### 🔴 CRITICAL (Risk of Financial Loss, Crash, or Security)

1.  **Loose API Payload Validation (`src/routes/api/tpsl/+server.ts`)**
    *   **Risk:** The endpoint accepts a generic `params` object in the body without strict schema validation (Zod). While it cleans keys, it doesn't validate value types or structure depth, potentially allowing malformed data to be sent to the exchange API or causing unexpected behavior in the signing logic.
    *   **Recommendation:** Implement a strict Zod schema for `params` based on the specific action (e.g., `TpSlParamsSchema`).

2.  **Implicit Type Conversion in Market Data (`src/services/marketWatcher.ts`)**
    *   **Risk:** `MarketWatcher` passes raw `number` types (from WebSocket "Fast Path") directly to `marketState.updateSymbol`. While `marketState` currently handles the conversion to `Decimal`, this implicit dependency is fragile. If `marketState` logic changes or if a new consumer accesses the raw data expecting `Decimal`, it could lead to precision errors.
    *   **Recommendation:** Enforce `Decimal` conversion strictly at the `BitunixWs` boundary or within `MarketWatcher` before it reaches the Store.

### 🟡 WARNING (Performance, UX, Missing I18n)

1.  **Missing I18n in Market Dashboard (`src/components/shared/MarketDashboardModal.svelte`)**
    *   **Issue:** Several section headers ("Market Heat", "Market Breadth", "Top Opportunity", "Status") and table headers ("Trend", "RSI", "Score") are hardcoded strings. This breaks the multi-language support.
    *   **Recommendation:** Move these strings to `src/locales/locales/en.json` and use `$_` keys.

2.  **Potential Memory Leak in Trade Listeners (`src/services/bitunixWs.ts`)**
    *   **Issue:** `tradeListeners` is a `Map<string, Set<Function>>`. If consuming components (e.g., UI widgets) subscribe but fail to call `unsubscribeTrade` on destroy, this map will grow indefinitely, holding references to closures and preventing GC.
    *   **Recommendation:** Audit all usages of `subscribeTrade` and ensure `onDestroy` or `$effect.return` is used. Consider using a `WeakRef` or a strict subscription handle pattern.

3.  **Untyped API Returns (`src/services/tradeService.ts`)**
    *   **Issue:** `fetchTpSlOrders` returns `Promise<any[]>`. This lacks type safety for consumers, leading to potential runtime errors if the API response shape changes.
    *   **Recommendation:** Define a `TpSlOrder` interface and cast the result, or validation with Zod.

### 🔵 REFACTOR (Technical Debt)

1.  **Manual JSON Construction (`src/services/tradeService.ts`)**
    *   **Issue:** The `signedRequest` method manually spreads `...serializedPayload` into the body object before `JSON.stringify`. This "magic" serialization is opaque and could be error-prone if nested objects need specific handling.
    *   **Recommendation:** Use a dedicated `RequestBuilder` or `PayloadSerializer` class that handles `Decimal` conversion and signing preparation explicitly.

2.  **Complex Polling Logic (`src/services/marketWatcher.ts`)**
    *   **Issue:** `performPollingCycle` contains complex staggering and "Zombie Request" logic mixed with business logic.
    *   **Recommendation:** Extract polling mechanics into a generic `PollingManager` class to separate concerns.

## 3. Conclusion
The "Institutional Grade" goal requires closing the gaps in Type Safety (API boundaries) and ensuring 100% I18n coverage. The "Fast Path" optimization is excellent for performance but needs safer guardrails (Zod schemas for all ingress points). The identified memory leak risk in WebSocket listeners should be addressed immediately to ensure long-running stability.
