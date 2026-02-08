# Status & Risk Report: Cachy App Maintenance

## 1. Prioritized Findings

### 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1.  **WebSocket "Fast Path" Type Safety (`src/services/bitunixWs.ts`)**
    *   **Finding:** The `handleMessage` method uses a "Fast Path" optimization for high-frequency data (Price/Ticker) that bypasses Zod schema validation. It manually casts fields like `typeof data.ip === 'number' ? String(data.ip) : data.ip`.
    *   **Risk:** While defensive, the type guards (`isPriceData`, `isTickerData`) currently use loose checks (e.g., checking for property existence without strict type verification). If the API sends `null` or an unexpected object structure, it could lead to runtime errors or incorrect data propagating to the UI/Trading engine.
    *   **Recommendation:** Harden `isPriceData` and similar guards to strictly check for `string | number` types and reject `null`/`undefined` explicitly.

2.  **Timeframe Parsing Vulnerability (`src/services/marketWatcher.ts`)**
    *   **Finding:** The `tfToMs` helper function uses `parseInt` and `slice` without validating the input string format.
    *   **Risk:** Malformed timeframes (e.g., empty string, "invalid") could return `NaN` or incorrect milliseconds, potentially causing infinite loops or incorrect data fetching intervals.
    *   **Recommendation:** Implement a robust `safeTfToMs` utility with regex validation.

### 🟡 WARNING (Performance issue, UX error, missing i18n)

1.  **Missing Internationalization (i18n) in Visuals Tab (`src/components/settings/tabs/VisualsTab.svelte`)**
    *   **Finding:** Numerous hardcoded UI strings found (e.g., "Mode", "Enhanced Effects", "Flow Speed", "Volume Scale").
    *   **Risk:** Poor UX for non-English users.
    *   **Recommendation:** Extract these strings to `src/locales/locales/en.json` and use the `$_` store.

2.  **Unhanded Worker Initialization Error (`src/components/shared/backgrounds/TradeFlowBackground.svelte`)**
    *   **Finding:** The component throws a raw `Error("OffscreenCanvas not supported...")` without catching it.
    *   **Risk:** On older browsers or environments where OffscreenCanvas is disabled, this causes the entire component (and potentially the parent view) to crash/unmount unexpectedly.
    *   **Recommendation:** Wrap initialization in a `try-catch` block and display a fallback or graceful error state.

3.  **Heavy Calculation in Market Store (`src/stores/market.svelte.ts`)**
    *   **Finding:** `applySymbolKlines` performs complex merging and array manipulation. While it uses `Float64Array` for optimization (SoA), it runs on the main thread.
    *   **Risk:** High-frequency WebSocket updates during high volatility could cause UI stutter.
    *   **Recommendation:** Consider moving heavy merging logic to a Web Worker in the future (Blue/Refactor).

### 🔵 REFACTOR (Code smell, technical debt)

1.  **Duplicate Timeframe Logic**
    *   **Finding:** `tfToMs` logic appears in `marketWatcher.ts` and likely other places (implicitly).
    *   **Recommendation:** Centralize in `src/utils/timeUtils.ts`.

## 2. Implementation Plan

The following actions will be taken to address the critical and warning items:

1.  **Harden Utilities:** Create `src/utils/timeUtils.ts` with `safeTfToMs` and tests.
2.  **Refactor MarketWatcher:** Use `safeTfToMs`.
3.  **Harden WebSocket:** Improve type guards in `bitunixWs.ts`.
4.  **Fix i18n:** Update `en.json` and `VisualsTab.svelte`.
5.  **Fix Error Handling:** Wrap `TradeFlowBackground` init in `try-catch`.
