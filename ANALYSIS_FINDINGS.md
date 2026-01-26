# System Maintenance & Hardening Report

## Executive Summary
The codebase demonstrates a solid foundation with extensive use of `Decimal.js` for financial calculations and robust "Zombie" protection for WebSocket connections. However, critical risks exist regarding international number formatting (comma vs. dot) and specific UI inputs that could lead to silent data corruption (e.g., `parseFloat("1,5") === 1`).

## 🔴 CRITICAL FINDINGS (Immediate Action Required)

### 1. Ambiguous Decimal Parsing (Data Integrity)
- **Location:** `src/utils/utils.ts` -> `parseDecimal`
- **Issue:** The function uses a heuristic ("3 digits after comma = thousands separator") to distinguish between German (`1.200,50`) and English (`1,200.50`) formats.
- **Risk:** In Crypto, `1,200` is often a valid quantity (1.2). If a user inputs "1,200" intending "1.2", the system might interpret it as "1200", leading to massive over-ordering.
- **Recommendation:** Remove the heuristic for ambiguous cases. Enforce a strict format per user locale or UI setting, or strictly disallow ambiguous mixed inputs without explicit user confirmation.

### 2. Silent Floating Point Truncation (Data Integrity)
- **Location:** `src/components/inputs/GeneralInputs.svelte` -> `handleLeverageInput` / `handleFeesInput`
- **Issue:** Uses `parseFloat(value)`.
- **Risk:** If a user (German locale) enters "1,5" (intending 1.5x leverage), JS `parseFloat` stops at the comma and returns `1`. The user sees "1,5" in the input (text), but the internal state is `1`.
- **Recommendation:** Replace `parseFloat` with `parseDecimal` or a strict parser that handles/rejects commas explicitly.

## 🟡 WARNINGS (High Priority)

### 3. Missing i18n & Hardcoded Strings (UI/UX)
- **Location:** `src/components/inputs/GeneralInputs.svelte`
- **Issue:** Labels like `<label>Leverage</label>` and `<label>Fees (%)</label>` are hardcoded. Tooltips ("Synced with API") are also hardcoded.
- **Risk:** Incomplete localization for non-English users.
- **Recommendation:** Add keys to `en.json` (`dashboard.generalInputs.leverageLabel`, etc.) and use `$_`.

### 4. WebSocket "Fast Path" Type Safety (Stability)
- **Location:** `src/services/bitunixWs.ts`
- **Issue:** The "Fast Path" optimization uses extensive `as any` casting to skip Zod validation for performance.
- **Risk:** If Bitunix changes their API structure (e.g., renames `lp` to `last`), the fast path might silently inject `undefined` into the store.
- **Recommendation:** Create a lightweight "Fast Validator" (interface check) without the full overhead of Zod, or add stricter `typeof` checks before assignment.

### 5. API JSON Precision Loss (Data Integrity)
- **Location:** `src/routes/api/orders/+server.ts`
- **Issue:** Order history endpoints return values via `.toNumber()`.
- **Risk:** While the frontend `tradeService` typically uses the `*Str` fields (e.g., `priceStr`) for precision, the JSON response itself loses precision for very small/large numbers (IEEE 754).
- **Recommendation:** Ensure all consumers of this API prioritize `*Str` fields.

### 6. Unknown Order Status Masking (Observability)
- **Location:** `src/services/tradeService.ts` -> `mapOrderStatus`
- **Issue:** Unknown statuses default to "pending".
- **Risk:** "Expired" or "Rejected" orders might appear as stuck "Pending" orders in the UI.
- **Recommendation:** Add explicit cases for `EXPIRED`, `REJECTED` and default to a `unknown` or error state.

## 🔵 REFACTOR (Technical Debt)

### 7. Comma UX Friction
- **Location:** `src/components/inputs/TradeSetupInputs.svelte`
- **Issue:** The regex `/^(?:\d+(?:\.\d*)?|\.\d+)$/` strictly enforces dots. Users typing commas (Numpad default in DE) get no input response.
- **Recommendation:** Implement an `onInput` sanitizer that auto-replaces `,` with `.` to improve UX.

### 8. Potential Memory Leak in Commented Code
- **Location:** `src/stores/market.svelte.ts`
- **Issue:** `metricsHistory` array logic is commented out. If uncommented without a `.slice()` limit, it will cause a memory leak.
- **Recommendation:** Add a `MAX_HISTORY` constant and slice the array if this feature is re-enabled.

---

## Next Steps (Action Plan)

1. **Fix Critical Input Parsing:** Update `GeneralInputs` and `utils.ts` to handle commas safely.
2. **Apply i18n:** Extract hardcoded strings in `GeneralInputs`.
3. **Harden Status Mapping:** Update `tradeService` to handle edge-case order statuses.
