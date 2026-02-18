# Cachy App Codebase Analysis & Risk Report

**Date:** 2026-05-20
**Auditor:** Jules (Lead Architect)
**Status:** In-Progress

## 1. Executive Summary
The codebase is generally well-structured and uses modern practices (Svelte 5 Runes, Decimal.js). However, several critical vulnerabilities related to data integrity and error handling were identified that prevent it from being "institutional grade".

## 2. Findings

### 🔴 CRITICAL (Risk of financial loss / Data Corruption)

**1. Data Integrity: Unsafe Gap Filling in `MarketWatcher`**
*   **Location:** `src/services/marketWatcher.ts` (`fillGaps` method)
*   **Issue:** The `fillGaps` function assumes the input `klines` array is strictly sorted by time. If the API returns unsorted data (possible with some endpoints or race conditions), the gap calculation `klines[i].time - klines[i-1].time` will produce incorrect results (negative diffs), potentially corrupting the chart or infinite looping if logic isn't robust.
*   **Recommendation:** Explicitly sort `klines` by time before processing in `fillGaps`.

**2. Data Integrity: Fragile JSON Parsing in `BitunixWs`**
*   **Location:** `src/services/bitunixWs.ts` (Fast Path Regex)
*   **Issue:** The service uses a regex replacement to wrap numeric fields in quotes before `JSON.parse` to avoid precision loss.
    *   Regex: `/"(p|v|...|close)":\s*(-?\d+(\.\d+)?([eE][+-]?\d+)?)/g`
    *   Risk: While it handles standard cases, regex-based JSON patching is fragile. It could fail on unexpected whitespace patterns or if key names appear in string values.
*   **Recommendation:** Add comprehensive unit tests for this regex covering edge cases (scientific notation, integers, spacing). Consider a safer, state-machine based approach if tests reveal weaknesses.

**3. Type Safety: Loose API Validation in `TradeService`**
*   **Location:** `src/services/tradeService.ts` (`fetchOpenPositionsFromApi`)
*   **Issue:** The method casts `pendingResult.data` to `any[]` before validation. If `data` is not an array (e.g. `null` or object), it might throw runtime errors.
*   **Recommendation:** Validate the outer structure (is array) before iteration.

### 🟡 WARNING (UX / Stability / Performance)

**1. UI/UX: Hardcoded Error Messages**
*   **Location:** `src/routes/api/klines/+server.ts`
*   **Issue:** The API returns hardcoded strings like "Symbol not found". If displayed directly to the user, this bypasses i18n.
*   **Recommendation:** Return standardized error codes (e.g., `{ error: "SYMBOL_NOT_FOUND", code: 404 }`) and let the client handle translation.

**2. Security: Simple Regex in `NewsService`**
*   **Location:** `src/services/newsService.ts`
*   **Issue:** `matchesSymbol` uses a simple word boundary regex. It might trigger false positives for symbols that are common words (e.g., "ONE", "SUN").
*   **Recommendation:** Review and potentially tighten matching logic.

**3. Resource Management: Zombie Request Pruning**
*   **Location:** `src/services/marketWatcher.ts`
*   **Issue:** `pruneZombieRequests` assumes a fixed 20s timeout. On slow networks, this might kill valid requests prematurely.
*   **Recommendation:** Make timeout adaptive or configurable.

### 🔵 REFACTOR (Technical Debt)

**1. `MarketWatcher` Complexity**
*   **Issue:** The class is becoming a "God Object" handling polling, WS syncing, gap filling, and history management.
*   **Recommendation:** Extract `fillGaps` and `HistoryManager` into separate utilities/classes.

## 3. Action Plan (Preview)
1.  **Harden `marketWatcher.ts`**: Add sort and validation.
2.  **Verify `bitunixWs.ts`**: Add rigorous tests for the regex parser.
3.  **Harden `tradeService.ts`**: Improve API response validation.
4.  **Standardize API Errors**: Refactor `klines/+server.ts`.
