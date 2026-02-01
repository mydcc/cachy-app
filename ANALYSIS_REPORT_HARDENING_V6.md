# Systematic Maintenance & Hardening Report (Phase 1)

**Status:** IN PROGRESS
**Date:** 2026-05-23
**Author:** Jules (Senior Lead Developer)

This report details the findings from the in-depth code analysis of the `cachy-app` codebase, focusing on high-frequency trading requirements, data integrity, and stability.

## 1. Data Integrity & Mapping

### 🔴 CRITICAL: JSON Parsing Precision Loss in Arrays
**File:** `src/utils/safeJson.ts`
- **Issue:** The current regex `/"([^"]+)"\s*:\s*([0-9]{15,})(?!\.)/g` only protects large integers when they are values of a specific key (e.g., `"orderId": 1234567890123456789`).
- **Risk:** It **fails** to protect large integers inside arrays (e.g., `[1600000000000000000, "OPEN", ...]`). WebSocket messages for Klines or Depth often use array formats to save bandwidth. If Bitunix sends a 64-bit integer timestamp or ID in an array, `JSON.parse` will truncate it, causing data corruption before the application even sees it.
- **Impact:** Corrupted timestamps or IDs leading to sync errors or order failures.

### 🟡 WARNING: Input Validation & Formatting
**File:** `src/components/inputs/TradeSetupInputs.svelte`
- **Issue:** The `parseInputVal` function allows trailing dots (e.g., "123."). While `Decimal.js` handles this, sending "123." as a string to a strict API endpoint might cause a 400 Bad Request.
- **Recommendation:** Normalize inputs to strip trailing dots/commas before committing to the store.

## 2. Resource Management & Performance

### 🔴 CRITICAL: WebSocket "Fast Path" Vulnerability
**File:** `src/services/bitunixWs.ts`
- **Issue:** The `handleMessage` method implements a "Fast Path" optimization that bypasses Zod validation for `price`, `ticker`, and `depth` channels. It manually checks `isObjectData` but assumes field existence (e.g., accessing `data.lastPrice`).
- **Risk:** If the API schema changes (e.g., `lastPrice` becomes null or field name changes), the code might throw a runtime exception or inject `undefined` into `marketState`, causing UI crashes or calculation errors.
- **Remediation:** Wrap Fast Path accessors in `try-catch` blocks or add lightweight property existence checks.

### 🔵 REFACTOR: MarketWatcher Locking Complexity
**File:** `src/services/marketWatcher.ts`
- **Issue:** The class manages `fetchLocks`, `historyLocks`, `unlockTimeouts`, `proactiveLockTimeouts`, and `staggerTimeouts`. This high complexity makes it difficult to reason about race conditions, especially during rapid network state changes (Online <-> Offline).
- **Recommendation:** Simplify the locking mechanism or move to a reactive `Effect` based approach where possible.

## 3. UI/UX & Accessibility

### 🟡 WARNING: Missing i18n Keys (Hardcoded Strings)
**Scope:** Multiple Components
- **Issue:** Hardcoded English strings found in placeholders and logs.
    - `src/components/settings/tabs/VisualsTab.svelte`: "https://..."
    - `src/components/settings/tabs/AiTab.svelte`: "Channel ID"
    - `src/components/shared/CandlestickPatternsView.svelte`: "Search patterns..."
    - `src/components/shared/SidePanel.svelte`: "Type here..."
- **Risk:** Poor UX for non-English users.

### 🟡 WARNING: Input State Synchronization
**File:** `src/components/inputs/TradeSetupInputs.svelte`
- **Issue:** The bidirectional sync between `localSymbol` (UI state) and `symbol` (Prop/Store) relies on complex flags (`isSymbolFocused`).
- **Risk:** Race conditions where the input value "snaps back" or fails to update if an external event changes the symbol while the user is typing (or just finished typing).

## 4. Security & Validation

### 🟢 PASSED: Safe Decimal Usage
- **Status:** The codebase consistently uses `Decimal.js` for financial calculations in `tradeService.ts` and `market.svelte.ts`.
- **Note:** `bitunixWs.ts` correctly detects numeric types in incoming messages and warns/casts them, provided they survived `JSON.parse`.

### 🟢 PASSED: Secret Redaction
- **Status:** `logger.ts` (referenced) and `tradeService.ts` handling of API keys appears secure, with keys passed in request bodies and not logged.

---

## Recommended Action Plan (Step 2)

1.  **Harden JSON Parsing:** Update `safeJsonParse` regex to support array elements.
2.  **Stabilize WebSocket:** Add error boundaries to `bitunixWs.ts` Fast Path.
3.  **Fix i18n:** Extract discovered hardcoded strings to locale files.
4.  **Harden Inputs:** Sanitize `TradeSetupInputs` output before store update.
