# Systematic Maintenance & Hardening Report

## Status Quo Analysis

The codebase demonstrates a solid foundation with TypeSript strict mode, usage of `decimal.js` for financial calculations, and some usage of Zod for validation. However, critical vulnerabilities regarding data integrity and resource management were identified.

## Prioritized Findings

### 🔴 CRITICAL (Immediate Action Required)

1.  **Data Integrity in Position Updates (`src/stores/account.svelte.ts`)**
    *   **Risk:** Financial/UX. The `updatePositionFromWs` method silently discards WebSocket updates if the `side` property is missing from the payload (which occurs in some Bitunix update events) AND the local position is not yet initialized.
    *   **Consequence:** Users may see "No Position" while an open position exists, preventing them from closing it via the UI.
    *   **Fix:** Accept updates matching the `positionId` even if `side` is missing, or fetch the full position snapshot immediately if a partial update arrives for an unknown position.

2.  **Memory Leak in WebSocket Service (`src/services/bitunixWs.ts`)**
    *   **Risk:** Performance/Crash. The `syntheticSubs` map (used for calculated timeframes like 4h on streams that don't support it natively) accumulates entries. The `unsubscribe` logic may fail to clean these up correctly when the reference count drops to zero, especially if the `resolved.isSynthetic` check differs during unsubscribe or if the `getBitunixChannel` call returns null before cleanup.
    *   **Fix:** Ensure `syntheticSubs.delete(key)` is called when the last listener unsubscribes, regardless of whether the native channel mapping is found.

### 🟡 WARNING (High Priority)

3.  **Inconsistent Input Validation (`src/routes/api/orders/+server.ts`)**
    *   **Risk:** Security/Stability. While `tpsl/+server.ts` uses Zod, the main orders endpoint relies on manual parsing and casting (`safeDecimal` helper).
    *   **Fix:** Implement Zod schemas for all order endpoints to reject malformed data before processing.

4.  **Missing Internationalization (`src/routes/+layout.svelte`)**
    *   **Risk:** UX. Hardcoded strings (e.g., "Jules Report", "Analyzing...") are present in the layout, bypassing the `svelte-i18n` system.
    *   **Fix:** Extract strings to `en.json` / `de.json` and use `$_()`.

5.  **Risky Serialization Logic (`src/services/serializationService.ts`)**
    *   **Risk:** Stability. The `stringifyAsync` method manually constructs JSON strings by slicing `JSON.stringify` output (`slice(1, -1)`). If the runtime behavior of `JSON.stringify` changes (e.g., spacing/formatting), this could corrupt data.
    *   **Fix:** Use a robust streaming JSON library or stricter checks before slicing.

### 🔵 REFACTOR (Technical Debt)

6.  **Inconsistent API Error Handling**
    *   Some endpoints return 500 for logic errors; others return 400. Standardize on a helper like `getErrorMessage` or a middleware pattern.

## Implementation Plan

The following plan addresses these findings, starting with the Critical items.
