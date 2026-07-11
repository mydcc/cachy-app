# In-depth Analysis & Risk Report for cachy-app

## 1. Data Integrity & Mapping

### Findings
- **🔴 CRITICAL: Inconsistent use of safeJsonParse vs JSON.parse.**
  The `grep` results show that `JSON.parse` is still widely used in several places, including stores (e.g. `src/stores/ai.svelte.ts`, `src/stores/settings.svelte.ts`), API routes (e.g. `src/routes/api/orders/+server.ts`, `src/routes/api/ai/gemini/+server.ts`), and services (e.g. `src/services/backupService.ts`, `src/services/apiQuotaTracker.svelte.ts`). As identified in the context and tests (like `src/utils/tests/precision_loss.test.ts`), native `JSON.parse` destroys the precision of 64-bit integers and large floats. This is unacceptable for a financial app and risks corrupting order IDs and quantities.
- **🔴 CRITICAL: Downcasting Decimals to Native Floats.**
  The `grep` results for `.toNumber()` indicate that `Decimal` objects are being downcasted back into native JavaScript floats in critical services, such as `src/services/activeTechnicalsManager.svelte.ts:654`. This completely defeats the purpose of using `Decimal.js` and introduces floating-point inaccuracies into technical calculations and UI representation.
- **🟡 WARNING: Missing `try/catch` or unsafe `catch(e: any)` around parsing.**
  Several locations directly execute `JSON.parse` without robust error boundaries, potentially crashing the UI thread if the API returns malformed JSON or HTML (e.g., during 502 Bad Gateway).

## 2. Resource Management & Performance

### Findings
- **🟡 WARNING: Unbounded Collections and Missing `clear()` on Teardown.**
  `MarketWatcher` (and potentially other services) use caching mechanisms and tracking variables (like `exhaustedHistory`, `prunedRequestIds`, `marketState.data`). While some pruning exists, failure to aggressively clear all Maps/Sets during teardown (`destroy()` methods) can lead to memory leaks in an SPA environment where users keep the dashboard open for hours.
- **🟡 WARNING: Eviction Strategy Risks in `MarketWatcher`.**
  If `MarketWatcher` evicts inactive entries from reference-counted maps using unsafe iterators (`.keys().next().value`) instead of iterating through `.entries()` and checking `val === 0`, it could corrupt active application state by removing active subscriptions.

## 3. UI/UX & Accessibility (A11y)

### Findings
- **🟡 WARNING: Raw API Error Messages in UI.**
  If the API returns an HTML proxy page or unhandled gateway error, the `toastService` or error boundaries might render the raw payload. Error messages must check for HTML and map to a localized key (e.g., `apiErrors.invalidResponse`).
- **🟡 WARNING: Unsanitized `{@html}` tags.**
  There is a risk of Cross-Site Scripting (XSS) if raw backend or user-provided data is inserted using `{@html}` without wrapping it in `DOMPurify.sanitize()`.

## 4. Security & Validation

### Findings
- **🔴 CRITICAL: Optimistic UI Rollback on Network Timeouts.**
  Handling network timeouts by unconditionally reverting the local state (e.g., `removeOrder`) creates a fatal race condition. If the exchange successfully executes the order but the local UI times out and removes it, the user might assume the order failed and place it again, leading to accidental double-ordering (financial loss). Orders must be marked as `_isUnconfirmed = true` instead of removed.

---

# Action Plan

## 1. Global JSON Serialization Hardening (CRITICAL)
- **Action**: Replace unsafe `JSON.parse` calls with the custom `safeJsonParse` utility (which safely handles large numeric IDs and catches exceptions) across all `src/stores`, `src/routes/api`, and `src/services`.
- **Justification**: Prevents precision loss on order IDs and floats, which can cause severe financial inconsistencies and crash APIs expecting strings/decimals.

## 2. Enforce Strict Decimal Precision (CRITICAL)
- **Action**: Remove usages of `.toNumber()` on Decimal objects in technicals and UI logic (like `activeTechnicalsManager.svelte.ts`). Refactor functions/stores to accept and pass `Decimal` objects natively end-to-end.
- **Justification**: Prevents floating point errors when plotting charts, triggering stops, or calculating order margins.

## 3. Optimistic UI Race Condition Fix (CRITICAL)
- **Action**: Modify the order placement logic (e.g., inside `TradeService` or UI managers) to handle timeout and indeterminate failures. Ensure unconfirmed orders are flagged (e.g. `_isUnconfirmed = true`) rather than deleted from local state to prevent double-ordering.
- **Test case**: Add a Vitest case where order placement simulates a timeout, and verify the order remains in state as "unconfirmed" instead of being purged.
- **Justification**: Direct mitigation for the double-order risk.

## 4. Memory Leak Hardening & Resource Eviction (WARNING/REFACTOR)
- **Action**: Review `MarketWatcher.ts` teardown methods. Ensure all internal Maps and Sets are unconditionally cleared using `.clear()`. Fix any unsafe `.keys().next().value` eviction loops to use `.entries()` and verify `val === 0`.
- **Justification**: Measurably improves stability and prevents the app from crashing due to out-of-memory errors over long sessions.

## 5. Security & UI Error Hardening (WARNING)
- **Action**: Ensure `BitunixApiError.rawMessage` checks for HTML (`.toLowerCase().includes('<html')`) and falls back to safe keys. Apply `DOMPurify.sanitize()` to any `{@html}` blocks found.
- **Justification**: Mitigates XSS risks and prevents confusing UI state during gateway outages.
