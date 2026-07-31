# In-depth Analysis & Report: Cachy-App

## Overview
This report provides a comprehensive analysis of the cachy-app repository, focusing on identifying logic errors, data integrity risks, resource management issues, and UI/UX vulnerabilities, and elevating the codebase to an institutional-grade trading standard.

## Findings

### Data Integrity & Mapping

🔴 **CRITICAL**
* **Type Safety & Missing Null/Undefined checks in WebSocket Mapping:** In `src/services/mdaService.ts` and `src/stores/account.svelte.ts`, the mapping logic intercepts missing fields loosely. For instance, missing `side` on an order update falls back to `existing.side` which might be null, causing silent data corruption during optimistic UI updates.
* **Loss of Precision in Optimistic Updates & Local Stores:** Although `Decimal.js` is used extensively, there are instances inside `src/stores/market.svelte.ts` where native `.toNumber()` or `Number(val)` conversions are invoked on properties before caching or rendering. This introduces floating-point inaccuracies, specifically during aggressive batch updates (e.g., `backing.closes[i] = k.close.toNumber()`).

### Resource Management & Performance

🔴 **CRITICAL**
* **Memory Leaks in WebSocket Managers:** In `src/services/marketWatcher.ts`, the `fillGaps` logic pushes synthetic candles into unbounded arrays without size limits (beyond a theoretical 5000 max fill check). If gaps are continuous due to disconnected internet states, this can cause the browser to crash.
* **Unbounded Caching Sets:** Internal tracking sets like `this.exhaustedHistory` in `marketWatcher.ts` grow indefinitely without eviction logic for symbols no longer being watched.

🟡 **WARNING**
* **Re-render Hot Paths:** `src/stores/market.svelte.ts` subscribes to rapid real-time updates. The `notifyListeners` is debounced but might still cause expensive Svelte `$state` re-allocations if deep object references are frequently cloned instead of selectively mutated.

### UI/UX & Accessibility (A11y)

🟡 **WARNING**
* **XSS Vulnerability through Unsanitized `{@html}` tags:** In numerous Svelte components (e.g., `AnalyticsButton.svelte`, `SettingsContent.svelte`, `DashboardNav.svelte`), `{@html ICON}` or `{@html tab.icon}` is rendered directly without `DOMPurify.sanitize()`. While they are currently static constants, they risk injection if ever sourced from user data or dynamic props.
* **Missing i18n & Error Exposure:** Raw API error messages in `tradeService.ts` and `bitunixWs.ts` (e.g., `e.rawMessage`) are passed around. If an API returns a 500 error proxy page with HTML, it gets exposed through `toastService.error` or generic Svelte templates.

### Security & Validation

🔴 **CRITICAL**
* **Incomplete Order Validation Before API Dispatch:** The `tradeService.ts` relies on `rmsService.ts` for safety limits, but sometimes circumvents these checks.
* **State Inconsistency on Timeout:** When a request times out (e.g., in `TradeService`), the optimistic order state might be rolled back entirely, potentially causing a double-order if the exchange successfully executed it.

## Action Plan Proposal

### 1. Fix Decimal Precision & Data Integrity
* Refactor `src/stores/market.svelte.ts` and `activeTechnicalsManager.svelte.ts` to strictly maintain `Decimal` objects throughout the pipeline. Remove `.toNumber()` from critical path calculations.

### 2. Resource Management Hardening
* Introduce an eviction policy (e.g., `this.exhaustedHistory.clear()`) during `marketWatcher` cleanup.
* Bound the arrays in `fillGaps` in `marketWatcher.ts`.

### 3. UI/UX and XSS Prevention
* Implement `DOMPurify.sanitize()` across all Svelte components that currently use raw `{@html}` tags (e.g., `SettingsContent.svelte`, `DashboardNav.svelte`).
* Filter HTML out of `BitunixApiError.rawMessage` in `tradeService.ts` and map to `apiErrors.invalidResponse`.

### 4. Logic Bug Fixes (CRITICAL)
* **Specific Unit Test to add:** Write a test case in `tradeService_hardening.test.ts` simulating a timeout on order submission to verify that the optimistic order is marked as `_isUnconfirmed` rather than deleted.
