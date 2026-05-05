
# In-Depth Status & Risk Report: cachy-app Codebase

Based on a thorough scan of the repository, focusing on data integrity, resource management, UI/UX, and security as requested, here is the prioritized list of findings.

## 🔴 CRITICAL: Risk of financial loss, crash, or security vulnerability

1.  **Floating-Point Inaccuracies in Price/Quantity Calculations (Financial Risk)**
    *   **Finding:** Pervasive use of native JavaScript `Number()` and `parseFloat()` for critical financial data conversions, directly violating institutional standards requiring strictly Decimal types.
    *   **Locations:**
        *   `src/services/mdaService.ts`: Parsing timestamps/prices (e.g., `Number(k.time || k.t)`, `time: Number(k[0] || k.time)`).
        *   `src/services/bitunixWs.ts`: Timestamp parsing (`t: Number(item.t ?? item.ts ?? item.time ?? Date.now())`).
        *   `src/stores/ai.svelte.ts`: Widespread casting to numbers for financial values (e.g., `new Decimal(t.totalNetProfit || 0).toNumber()`, `Number(d.priceStart).toFixed(4)`, `Number(Number(data.volatility.atr ?? 0).toFixed(4))`).
        *   `src/stores/market.svelte.ts`: Direct mapping to float arrays (`k.open.toNumber()`).
    *   **Risk:** Precision loss in floating-point operations can lead to incorrect order sizes, invalid stop-loss/take-profit triggers, and ultimately, direct financial loss. The current "buffer directly" optimization (`parseFloat`, `.toNumber()`) trades off institutional safety for marginal performance gains.

2.  **Missing WebSocket Teardowns (Memory Leaks)**
    *   **Finding:** Services initializing `setInterval` for watchdog timers or ping intervals do not have matching `clearInterval` mechanisms, or they are missing proper teardown on service destruction.
    *   **Locations:**
        *   `src/stores/chat.svelte.ts`: `setInterval(() => this.poll(), POLL_INTERVAL)` is initiated without a clear cleanup path on component/store destruction.
        *   `src/services/apiService.ts`: `this.cleanupInterval = setInterval(...)` lacks a corresponding `destroy()` or cleanup lifecycle method.
    *   **Risk:** Lingering timers keep the associated scope alive, causing memory leaks that will eventually crash the node process or the user's browser, degrading overall system stability, especially during hot reloads or frequent view changes.

3.  **Missing Error Handlers on API Payloads (Crash Risk)**
    *   **Finding:** Direct property access on external API responses without robust null/undefined checks or `.catch()` handlers that assume specific payload structures.
    *   **Locations:** Various service endpoints using fetch or WebSocket callbacks without wrapping parsing logic in try/catch.
    *   **Risk:** Unhandled promise rejections or type errors ("Cannot read property 'x' of undefined") when the exchange API goes down or changes format, leading to silent failures or application crashes.

## 🟡 WARNING: Performance issue, UX error, missing i18n

1.  **Unbounded Arrays in Stateful Stores (Performance/Memory)**
    *   **Finding:** Continual push/append operations to arrays in memory-bound services without strict bounded eviction (pruning).
    *   **Locations:**
        *   `src/services/omsService.ts`, `src/services/tradeService.ts`: Potential unbound caching of historical orders or data without a max-length cap.
    *   **Risk:** Gradual memory inflation over long trading sessions, leading to sluggish UI updates and browser freezing.

2.  **Inconsistent Error Messages / Hardcoded Strings (UX/A11y)**
    *   **Finding:** Error messages in services often use raw strings instead of predefined localization keys (e.g., `TRADE_ERRORS`).
    *   **Locations:** Scattered throughout `TradeService` and component catch blocks.
    *   **Risk:** Users in non-English locales receive un-translated, potentially confusing technical errors, violating a11y and UX best practices for actionable feedback.

3.  **Direct DOM Manipulation & Unsafe `@html` Usage (Security/A11y)**
    *   **Finding:** Extensive use of `@html` in Svelte components for rendering content. While some use `DOMPurify.sanitize` (e.g., `SettingsContent.svelte`, `Icon.svelte`), others inject icons or raw string manipulations directly.
    *   **Locations:** Over 40 instances of `{@html ...}` across components (`src/components/shared/MarketOverview.svelte`, `src/components/shared/CalculationDashboard.svelte`, etc.).
    *   **Risk:** Even with sanitization, excessive reliance on `@html` increases the attack surface for XSS if untrusted data ever bypasses the purifier, and it hurts frontend performance by bypassing Svelte's reactive DOM updates.

## 🔵 REFACTOR: Code smell, technical debt

1.  **Type Safety Gaps in Service Payloads**
    *   **Finding:** Use of generic interfaces or `any` for complex API responses instead of rigorous `zod` parsing.
    *   **Locations:** Data mappers in `src/services/mappers.ts` and `src/services/mdaService.ts`.
    *   **Risk:** Reduces developer confidence and increases the chance of regressions during refactoring, though it may not cause immediate crashes if upstream data is stable.
