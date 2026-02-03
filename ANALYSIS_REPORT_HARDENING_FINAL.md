# Systematic Maintenance & Hardening Report

**Date:** 2026-05-23
**Role:** Senior Lead Developer & Systems Architect
**Subject:** Status Quo Analysis of `cachy-app` Codebase

## 1. Executive Summary

The codebase demonstrates a high level of maturity and "institutional grade" quality in critical areas such as financial arithmetic, resource management, and state architecture. The widespread use of `Decimal.js` prevents floating-point errors, and the memory management strategies (e.g., zombie request pruning, buffer limits) are robust against high-frequency data storms.

However, maintainability risks exist in the WebSocket service due to complexity optimization ("Fast Path"), and minor technical debt is present in the UI layer (hardcoded assets).

## 2. Detailed Findings

### 2.1 Data Integrity & Mapping

*   **Financial Arithmetic**: The application consistently uses `Decimal.js` for all price and volume calculations, which is excellent. `TradeService` correctly serializes these decimals before API transmission.
*   **Type Safety**:
    *   `src/types/bitunixValidation.ts` enforces `orderId` as a strict `string` to prevent precision loss on large IDs (e.g., > `MAX_SAFE_INTEGER`).
    *   `src/services/apiService.ts` correctly filters `NaN` values from kline data.
*   **Validation**: The `apiService` uses strict Zod schemas. However, the `BitunixWebSocketService` implements a "Fast Path" that bypasses Zod for performance. While guarded by `try-catch` blocks, this creates a hidden maintenance burden where schema drifts might cause silent failures (caught exceptions) rather than explicit validation errors.

### 2.2 Resource Management & Performance

*   **Memory Leaks**:
    *   `MarketWatcher` (`src/services/marketWatcher.ts`) implements a `pruneZombieRequests` mechanism and strict timeout management, effectively preventing request accumulation.
    *   `MarketManager` (`src/stores/market.svelte.ts`) enforces hard limits on `pendingKlineUpdates` buffers, preventing Out-Of-Memory (OOM) errors during WebSocket storms.
*   **Hot Paths**:
    *   `BitunixWebSocketService` bypasses expensive Zod parsing for high-frequency `price` and `ticker` updates. This is a valid optimization but increases complexity.
    *   `MarketManager` uses `untrack` (Svelte 5) effectively to prevent reactivity loops during high-frequency updates.

### 2.3 UI/UX & Accessibility (A11y)

*   **Internationalization (i18n)**: Most components (e.g., `PortfolioInputs.svelte`) correctly use the `$_` store for translations.
*   **Technical Debt**: `src/components/inputs/PortfolioInputs.svelte` contains hardcoded SVG strings within `{@html ...}` blocks as fallbacks for the `icons` constant. This clutters the template and duplicates code.

### 2.4 Security & Validation

*   **Input Validation**: User inputs in `TradeSetupInputs` (analyzed via dependencies) and `PortfolioInputs` utilize `numberInput` actions and `safeJsonParse` for robust handling.
*   **XSS Prevention**: `DisclaimerModal` uses `sanitizeHtml` (DOMPurify). `{@html}` usage in other components is primarily for trusted SVG icons from `constants.ts`.

## 3. Prioritized Findings

### 🔴 CRITICAL (0)
*   *No critical vulnerabilities detected that pose an immediate risk of financial loss or security breach.*

### 🟡 WARNING (1)
*   **Hardcoded Assets in UI**: `src/components/inputs/PortfolioInputs.svelte` contains hardcoded SVG strings.
    *   *Risk*: Inconsistent iconography, difficult maintenance, potential layout issues if SVGs are malformed.
    *   *Recommendation*: Move all icons to `src/lib/constants.ts` or a dedicated icon registry.

### 🔵 REFACTOR (2)
*   **Complex WebSocket "Fast Path"**: `src/services/bitunixWs.ts` contains a large, monolithic `handleMessage` method with mixed "Fast Path" and Zod validation logic.
    *   *Risk*: High cognitive load, difficult to unit test, prone to regression if API specs change.
    *   *Recommendation*: Extract the "Fast Path" logic into a dedicated helper function or class with explicit type guards.

*   **Duplicate Type Guards**: The type guards (`isPriceData`, etc.) in `bitunixWs.ts` are loosely defined (`any`).
    *   *Risk*: False positives in data detection.
    *   *Recommendation*: Tighten type guards or use a lightweight validation layer.

## 4. Conclusion

The system is in a healthy state. The recommended actions focus on hardening the WebSocket handling to ensure long-term maintainability and cleaning up minor UI technical debt.
