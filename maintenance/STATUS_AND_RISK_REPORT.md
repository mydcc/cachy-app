# Status & Risk Report

**Date:** 2026-05-25
**Scope:** `src/` (Core Services, Stores, UI Components)
**Author:** System Architect (AI)

## Executive Summary
The codebase is generally well-structured with a strong focus on performance (e.g., "Fast Path" in WebSocket handling, BufferPools). However, there are critical gaps in internationalization (i18n), potential type safety regressions due to excessive `any` usage in core services, and some resource management risks in high-frequency loops.

## 🔴 CRITICAL RISKS
*Risk of financial loss, crash, or security vulnerability.*

1.  **Missing Translation Keys (UI/UX / Crash Risk)**
    *   **Location:** `src/components/inputs/PortfolioInputs.svelte`
    *   **Issue:** The component references `settings.errors.invalidApiKey`, `settings.errors.ipNotAllowed`, `settings.errors.invalidSignature`, and `settings.errors.timestampError`.
    *   **Evidence:** These keys do not exist in `src/locales/locales/en.json`.
    *   **Impact:** Users will see raw key names (e.g., `settings.errors.invalidApiKey`) instead of helpful error messages, or `svelte-i18n` might throw depending on configuration.
    *   **Remediation:** Add missing keys to `en.json` immediately.

2.  **Unchecked Type Propagation in Trade Listeners (Data Integrity)**
    *   **Location:** `src/services/bitunixWs.ts` -> `trade` channel
    *   **Issue:** `tradeListeners` are typed as `Set<(trade: any) => void>`. The `any` type propagates to subscribers (e.g., `TradeService` or UI).
    *   **Impact:** If the API response structure changes, consumers will crash at runtime without compile-time warning.
    *   **Remediation:** Define a strict `TradeData` interface and use it in `tradeListeners`.

3.  **Allocation in High-Frequency Loop (Performance)**
    *   **Location:** `src/services/marketWatcher.ts` -> `fillGaps`
    *   **Issue:** `const ZERO_VOL = new Decimal(0);` is allocated *inside* the function, which is called in a loop for every chunk of history backfill.
    *   **Impact:** Unnecessary garbage collection pressure during heavy data loads.
    *   **Remediation:** Move `ZERO_VOL` to a module-level constant.

4.  **Generic Error Mapping (UX/Debugging)**
    *   **Location:** `src/services/tradeService.ts`
    *   **Issue:** `mapApiErrorToLabel` in `PortfolioInputs` relies on regex matching of error messages (e.g., `/api key/i`). If the API changes its error message format (which is common), these checks will fail silent.
    *   **Impact:** Users receive generic "Fetch failed" errors instead of actionable "Invalid API Key" feedback.
    *   **Remediation:** Rely on error *codes* where possible, or centralize the mapping logic in a robust utility.

## 🟡 WARNINGS
*Performance issue, UX error, or missing best practice.*

1.  **"Fast Path" Validation Bypass (Stability)**
    *   **Location:** `src/services/bitunixWs.ts`
    *   **Issue:** The "Fast Path" manually casts fields (e.g., `typeof data.ip === 'number' ? String(data.ip) : data.ip`) to bypass Zod validation for performance.
    *   **Risk:** While performant, this duplicates validation logic and is fragile to API schema changes. A numeric overflow in a price field (if sent as number > MAX_SAFE_INTEGER) could be corrupted before casting.
    *   **Mitigation:** Ensure `safeJsonParse` handles large integers *before* this logic runs (currently implemented via regex, which is good but risky).

2.  **Excessive `any` Usage in TradeService**
    *   **Location:** `src/services/tradeService.ts`
    *   **Issue:** `serializePayload`, `fetchTpSlOrders`, and `closePosition` rely heavily on `any` casting.
    *   **Risk:** Refactoring becomes dangerous as TypeScript cannot catch type mismatches.

3.  **Complex Array Growth in MarketManager**
    *   **Location:** `src/stores/market.svelte.ts`
    *   **Issue:** The `updateSymbolKlines` method has complex logic for merging history (`push`, `splice`, `slice`). While bounds are checked (`effectiveLimit`), the complexity invites "off-by-one" errors or memory leaks if a condition is missed.
    *   **Recommendation:** Add unit tests specifically for the `Slow Path` merge logic to ensure it strictly respects limits.

## 🔵 REFACTOR OPPORTUNITIES
*Code smell, technical debt.*

1.  **Consolidate Safety Utilities:** `isSafe` (in `bitunixWs.ts`) and `safeJsonParse` (utils) should be aligned.
2.  **Centralized Error Constants:** Move hardcoded error strings (`trade.positionNotFound`) to a constants file or strictly typed enum.
3.  **Sanitize Markdown:** Verify `renderTrustedMarkdown` implementation to ensure it uses `DOMPurify` with strict config.

## Next Steps
Proceed to Phase 2: Implementation of fixes for Critical and Warning items.
