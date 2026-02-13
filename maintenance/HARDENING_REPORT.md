# Hardening & Maintenance Report

**Date:** 2026-05-25
**Author:** Jules (Lead Architect)
**Status:** ✅ Completed

## Overview

This report documents the systematic hardening measures applied to the `cachy-app` codebase to achieve an "institutional grade" standard. The focus areas were Data Integrity, Security, Resource Management, and UI/UX Resilience.

## 1. Data Integrity & Type Safety

### 🔍 Findings
- **JSON Precision Loss:** Native `JSON.parse` was vulnerable to corrupting 19-digit integer IDs (e.g., from Bitunix API), rounding them effectively.
- **Loose Typing:** `TradeService` used `any[]` for critical order data, increasing the risk of runtime errors.
- **WebSocket Data:** The high-frequency "Fast Path" in `bitunixWs.ts` lacked runtime validation for potential data corruption.

### 🛠️ Actions Taken
- **`src/utils/safeJson.ts`:** Implemented and rigorously tested a regex-based parser that wraps large integers (>= 15 digits) in strings before parsing.
  - *Verification:* `src/utils/safeJson.test.ts` passes with 100% coverage for edge cases.
- **`src/services/tradeService.ts`:** Introduced strict `TpSlOrder` interface. Updated `fetchTpSlOrders` to return `Promise<TpSlOrder[]>`.
- **`src/services/bitunixWs.ts`:** Added a Development-Mode-Only check that logs warnings if the "Fast Path" parser receives large integers that `safeJsonParse` would have protected.

## 2. Resource Management & Performance

### 🔍 Findings
- **Memory Leak:** `JournalManager` (`journal.svelte.ts`) allowed the `entries` array to grow indefinitely, risking browser crashes in long sessions.
- **Hot Path Inefficiency:** `MarketOverview.svelte` performed heavy `Decimal` object instantiations and string conversions on every price tick for visual effects.

### 🛠️ Actions Taken
- **Journal Cap:** Modified `addEntry` to enforce a hard limit of 1000 entries (FIFO eviction).
- **Render Optimization:** Optimized `MarketOverview.svelte` by:
  - Memoizing `currentPriceStr` to prevent cascading reactivity.
  - Using native `parseFloat` for visual trend comparison (Up/Down color) instead of `Decimal.gt`.

## 3. Security (XSS & Input Validation)

### 🔍 Findings
- **XSS Vulnerabilities:** Several components (`SidePanel`, `PerformanceMonitor`, `ContentRenderer`) injected raw HTML (`{@html ...}`) from potentially untrusted sources (translations or markdown).
- **Input Validation:** `PortfolioInputs.svelte` relied on basic HTML input types, allowing negative numbers or invalid characters to reach the state store.

### 🛠️ Actions Taken
- **Sanitization:** Applied `DOMPurify.sanitize()` to all `{@html ...}` injections in the identified components.
- **Strict Input Logic:** Implemented `validateInput` in `PortfolioInputs.svelte` with Regex (`/^\d*\.?\d*$/`) to strictly block invalid characters before state updates.

## 4. UI/UX Resilience & Accessibility

### 🔍 Findings
- **Broken States:** No visual indication when the WebSocket connection was lost, allowing users to attempt "blind" trades.
- **Accessibility:** Icon-only buttons in `SidePanel.svelte` lacked `aria-label` attributes.
- **Hardcoded Strings:** Critical UI elements (e.g., "Performance Monitor") used hardcoded English strings.

### 🛠️ Actions Taken
- **Offline Banner:** Implemented a global connectivity banner in `Header.svelte` that reacts to `marketState.connectionStatus`.
- **Action Blocking:** `PortfolioInputs` now disables balance fetching and critical actions when disconnected.
- **I18n:** Replaced hardcoded strings with `$_` localization keys.
- **A11y:** Added `aria-label` and `title` attributes to all navigation buttons.

## 5. Updates (2026-05-25 Evening)

### 🔍 Verified Hardening
- **End-to-End Testing:** Created `tests/e2e/connection_indicator.spec.ts` using Playwright.
  - *Result:* Successfully verified the Connection Indicator turns Green on connect and Red/Pulses on disconnect.
  - *Regression Found & Fixed:* `LeftControlPanel.svelte` was missing the `marketState` import, causing a runtime error in the compiled output. Fixed and verified.
- **Translation Sync:**
  - Ran `audit_translations.py`.
  - Added missing keys to `en.json` (accidentally truncated during edits, restored and merged).
  - Synced `de.json` with new keys (`trade.closeAbortedSafety`, `settings.performance.status.*`).
  - Regenerated `src/locales/schema.d.ts`.

## Remaining Risks / Next Steps

- **Performance Stress Test:** While `MarketWatcher` logic was hardened, a massive load simulation (50+ active charts) is the final frontier for stability.

---
*Signed: Jules, Senior Lead Developer*
