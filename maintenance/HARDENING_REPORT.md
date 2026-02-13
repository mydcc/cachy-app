# Hardening & Maintenance Report

**Date:** 2026-05-25 (Updated)
**Author:** Jules (Lead Architect)
**Status:** ⚠️ Hardened but Unverified

## Overview

This report documents the current state of the `cachy-app` codebase following a forensic analysis. While significant hardening measures have been implemented in the source code to address data integrity, resource management, and security, a critical gap exists in the verification layer (unit tests).

## 1. Data Integrity & Type Safety

### ✅ Implemented Measures
- **`src/utils/safeJson.ts`:** A custom parser is in place to handle large integers (e.g., 19-digit Order IDs) by regex-wrapping them in strings before parsing, preventing JavaScript `number` precision loss.
- **`src/services/tradeService.ts`:** Explicitly uses `Decimal` for financial calculations and includes a `TpSlOrder` interface to replace loose `any` types.
- **`src/services/bitunixWs.ts`:** The "Fast Path" WebSocket handler includes runtime checks (`isSafe`, `StrictPriceDataSchema`) to detect and warn about numeric precision risks in high-frequency data.

### 🔴 CRITICAL RISKS
- **Missing Regression Tests:** There are **no unit tests** in `tests/unit/` for `safeJson.ts`. If this utility fails or is refactored incorrectly, the entire application could silently corrupt Order IDs, leading to financial loss.
- **Unverified Schema Validation:** The strict schemas in `bitunixWs.ts` are not tested against edge-case payloads.

## 2. Resource Management & Performance

### ✅ Implemented Measures
- **`src/services/marketWatcher.ts`:** Optimizations like `static readonly ZERO_VOL` are present to reduce object allocation churn.
- **`src/stores/journal.svelte.ts`:** Implements a hard limit (1000 entries) in `addEntry` and `load` to prevent memory leaks.
- **`src/services/bitunixWs.ts`:** Uses `Set` for listener management and reference counting for subscriptions to prevent memory leaks.

### 🟡 WARNINGS
- **Store Limits Unverified:** No tests exist to prove that `marketState` or `journalState` correctly prune old data under load.
- **Array Allocations:** `MarketManager` uses a `BufferPool`, which is excellent, but its correct behavior under stress is not covered by tests.

## 3. UI/UX & Internationalization

### ✅ Implemented Measures
- **Error Mapping:** `src/components/inputs/PortfolioInputs.svelte` uses `mapApiErrorToLabel` to provide user-friendly error messages.
- **I18n Keys:** The required keys (`settings.errors.invalidApiKey`, etc.) are present in `src/locales/locales/en.json`.

### 🟡 WARNINGS
- **Hardcoded Strings:** Several settings components (`EngineDebugPanel.svelte`, `CalculationSettings.svelte`) contain hardcoded English strings ("Server Security", "CPU Impact"), bypassing the i18n system.

## 4. Security

### ✅ Implemented Measures
- **Input Validation:** `PortfolioInputs.svelte` implements `validateInput` to sanitize numeric inputs.
- **XSS Protection:** `MarketOverview.svelte` uses `{@html ...}` but injects trusted SVG constants from `src/lib/constants.ts`, which appears safe.

## Action Plan (Summary)

The codebase is "Code Complete" regarding hardening logic but "Verification Incomplete". The immediate priority is **Test Coverage**.

1.  **Create Unit Tests:** `safeJson`, `market_limits`, and `error_mapping`.
2.  **Verify Fixes:** Run these tests to confirm the implemented logic works as designed.

---
*Signed: Jules, Senior Lead Developer*
