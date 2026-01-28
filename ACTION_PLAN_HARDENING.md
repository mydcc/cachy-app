# Action Plan: Hardening & Maintenance (Step 2)

This plan outlines the specific steps to remediate the risks identified in the Analysis Phase.

## 1. Security & Logic Hardening (CRITICAL)

### 1.1 Fix XSS in `CustomModal.svelte`
- **Risk:** Arbitrary code execution via `{@html}`.
- **Action:** Import `sanitizeHtml` from `src/utils/utils.ts` and apply it to `mState.message`.
- **Justification:** Essential security fix.

### 1.2 Validate `tradeService.closePosition`
- **Risk:** Financial loss due to invalid order amounts (negative, zero, or > position size).
- **Test Case:**
  - Mock `omsService.getPositions()` to return a position of size 100.
  - Call `closePosition` with `amount` = -50. Expect: Error.
  - Call `closePosition` with `amount` = 200. Expect: Error (or Warning, depending on logic).
- **Action:** Add `Decimal` checks before calling API.

### 1.3 Harden `bitunixWs.ts` Fast Path
- **Risk:** App crash on malformed WS frame.
- **Action:** Wrap the "Fast Path" parsing block in `try { ... } catch (e) { ... }` and fallback to standard validation or safe logging.

## 2. Performance Optimization (HIGH)

### 2.1 Optimize `ai.svelte.ts` Storage
- **Risk:** UI Freeze on every chat character/message due to sync `localStorage`.
- **Action:** Implement a `debounce` (e.g., 1000ms) for the `save()` method.
- **Justification:** Significantly improves typing latency and main thread availability.

### 2.2 Optimize `ai.svelte.ts` Timeouts
- **Risk:** Slow AI responses when 3rd party APIs lag.
- **Action:** Reduce `Promise.race` timeout in `gatherContext` to 2000ms.

## 3. UI/UX & I18n (WARNING)

### 3.1 Localize `OrderHistoryList.svelte`
- **Risk:** English text shown to German users.
- **Action:**
  - Add keys to `src/locales/locales/en.json` (namespace: `dashboard.orderHistory`).
  - Update Component to use `$_(...)`.

---

## Execution Guidelines
- **Defensive Programming:** Assume API returns garbage.
- **No Regressions:** Run existing tests.
- **Strict Types:** Use `Decimal.js` for all math.
