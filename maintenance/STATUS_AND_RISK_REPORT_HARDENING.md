# Status & Risk Report: System Hardening

**Date:** 2026-05-20
**Author:** Jules (Lead Architect)
**Scope:** Data Integrity, Resource Management, UI/UX, Security

## Executive Summary
The codebase demonstrates a high level of maturity with widespread use of `Decimal.js` for financial calculations and `Zod` for runtime validation. However, critical risks exist in the WebSocket "Fast Path" (type safety bypass), potential memory leaks in subscription management, and inconsistent XSS protection strategies in the UI.

---

## 🔴 CRITICAL (Immediate Action Required)

### 1. WebSocket "Fast Path" Type Safety Risk
- **Location:** `src/services/bitunixWs.ts` (lines ~500-700)
- **Risk:** To reduce latency, the `handleMessage` method bypasses Zod validation for `price`, `ticker`, and `depth` events. It relies on a custom `isSafe` check (`!isNaN && isFinite`).
- **Vulnerability:** If the API changes the data format (e.g., sends a string "1,200.00" or null), the application might crash or process invalid prices. The manual casting logic is fragile.
- **Recommendation:** Implement a "Strict but Fast" validator or wrap the Fast Path in a more robust try-catch block that falls back to full Zod validation on failure.

### 2. Potential Memory Leak in WebSocket Listeners
- **Location:** `src/services/bitunixWs.ts` -> `tradeListeners`
- **Risk:** Components subscribing via `subscribeTrade` return a cleanup function, but there is no mechanism to enforce this cleanup. If components unmount without calling it, the `Set` of callbacks will grow indefinitely, holding references to unmounted components.
- **Recommendation:** Implement a `WeakRef` strategy or a strict subscription manager that ties listeners to component lifecycle (using `onDestroy` or `$effect` cleanup).

### 3. Unsafe `{@html}` Injection in MarketOverview
- **Location:** `src/components/shared/MarketOverview.svelte`
- **Risk:** Uses `{@html icons.monitor}`. While `icons` currently seems to come from a trusted constant source, this pattern bypasses the centralized `DOMPurify` sanitization found in `Icon.svelte`. Any future dynamic icon loading could introduce XSS.
- **Recommendation:** Replace all direct `{@html icons...}` usages with the `<Icon data={...} />` component.

---

## 🟡 WARNING (High Priority Fixes)

### 1. Numeric Precision in "Fast Path"
- **Location:** `src/services/bitunixWs.ts`
- **Issue:** The Fast Path detects numeric values for `indexPrice` and `fundingRate` and logs a warning, but it still processes them. Native JS numbers lose precision after 15 digits.
- **Fix:** Enforce string casting *before* any arithmetic or storage operations in the Fast Path.

### 2. Missing Translation Keys (i18n)
- **Location:** Various components (Spot checked `CalculationDashboard.svelte`)
- **Issue:** While `$_` is used extensively, some error messages and log outputs in services (`TradeService`, `MarketWatcher`) utilize hardcoded English strings.
- **Fix:** Extract all user-facing error strings from `src/services/` into `en.json`.

### 3. Loose Type Definition in `syntheticSubs`
- **Location:** `src/services/bitunixWs.ts`
- **Issue:** `syntheticSubs` is accessed via `@ts-ignore`. This defeats TypeScript's purpose and risks runtime errors if the internal structure changes.
- **Fix:** Properly define the `syntheticSubs` property on the class.

---

## 🔵 REFACTOR (Technical Debt)

### 1. Inconsistent SVG Rendering
- **Location:** Component Library
- **Issue:** Mix of `<Icon />` component and inline `{@html}`.
- **Fix:** Standardize on `<Icon />` to ensure `DOMPurify` is always applied.

### 2. Manual JSON Parsing in `TradeService`
- **Location:** `src/services/tradeService.ts`
- **Issue:** `signedRequest` manually parses JSON and casts to string for error codes.
- **Fix:** Use a standardized `ApiClient` wrapper that handles parsing and error normalization consistently across HTTP and WS.

---

## Action Plan (Preview)
1. **Hardening:** Secure `bitunixWs.ts` Fast Path.
2. **Sanitization:** Refactor `{@html}` to `<Icon />`.
3. **Resilience:** Add leak detection for WS listeners.
4. **i18n:** Extract service-level error messages.
