# Implementation Plan: Regression Testing & Verification

**Date:** 2026-05-25
**Priority:** High (Verification of Critical Financial Logic)

## Phase 1: Critical Verification (Data Integrity)

### 1.1 `safeJson` Regression Test
- **Goal:** Verify that 19-digit Order IDs (Bitunix API) are not corrupted by `JSON.parse`.
- **Action:** Create `tests/unit/safeJson.test.ts`.
- **Test Cases:**
  - Input: `{"id": 1234567890123456789}` -> Output: `{"id": "1234567890123456789"}`.
  - Input: `{"val": 123.456}` -> Output: `{"val": 123.456}` (Floats preserved).
  - Input: `[1234567890123456789]` -> Output: `["1234567890123456789"]` (Arrays handled).
- **Justification:** Prevents silent corruption of Order IDs which would cause `Order Not Found` errors during trade management.

### 1.2 `error_mapping` Unit Test
- **Goal:** Ensure raw API errors are translated to user-friendly i18n keys.
- **Action:** Create `tests/unit/error_mapping.test.ts`.
- **Test Cases:**
  - Input: `{ code: 10003 }` -> Output: `"settings.errors.invalidApiKey"`.
  - Input: `{ message: "Invalid signature" }` -> Output: `"settings.errors.invalidSignature"`.
  - Input: `{ message: "Unknown" }` -> Output: `null` (or fallback).
- **Justification:** Ensures actionable feedback for users during onboarding/connection issues.

## Phase 2: Stability Verification (Resource Limits)

### 2.1 `MarketManager` Limit Test
- **Goal:** specific test to ensure `marketState` does not grow unbounded.
- **Action:** Create `tests/unit/market_limits.test.ts`.
- **Test Cases:**
  - Push 2500 klines to a symbol.
  - Verify `marketState.data[symbol].klines[tf].length` <= 2000 (or configured limit).
  - Verify `BufferPool` reuses buffers (optional advanced check).
- **Justification:** Prevents browser crashes (OOM) during long-running sessions with high-frequency data updates.

## Execution Strategy

1.  Create `tests/unit/safeJson.test.ts`.
2.  Create `tests/unit/error_mapping.test.ts`.
3.  Create `tests/unit/market_limits.test.ts`.
4.  Run all tests via `npm test` (or `vitest run tests/unit`).

## Success Criteria

- All new tests pass.
- No regressions in existing tests.
