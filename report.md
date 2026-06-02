# Code Analysis Status & Risk Report
## 🔴 CRITICAL
- Checked: Data Integrity & Mapping in `omsService.ts` and `tradeService.ts`.
- Observation: In `tradeService.ts`, when optimistic orders fail to post to the API (`flashClosePosition`), the order is only removed on `isTerminalError`. For network timeouts (`else` branch), it's left in an indeterminate state `_isUnconfirmed`. According to defensive programming rules, it should be unconditionally rolled back.
- Action: Unconditionally remove the optimistic order in the catch block of `flashClosePosition`.

## 🟡 WARNING
- Checked: Resource Management & Memory Leaks in `bitunixWs.ts`.
- Observation: In `bitunixWs.ts`, there is no eviction logic for `syntheticSubs` and `pendingSubscriptions`. They can grow unbounded if unsubscribes fail or connections flap.
- Action: Implement size limits (e.g., 5000) and safely evict using `.entries()` checking for `val === 0` to prevent memory leaks and corruption.

## 🔵 REFACTOR
- Checked: UI/UX & A11y.
- Observation: In `tradeService.ts`, raw API errors like `BitunixApiError.rawMessage` might leak HTML or sensitive strings into the UI via the returned error message string.
- Action: Check for HTML in error messages and map them to safe `apiErrors.invalidResponse` keys. Add keys to localization files.

## Step 2: Action plan

### 1. Fix OMS Ghost Orders (🔴 CRITICAL)
- **Problem**: In `tradeService.ts` `flashClosePosition`, optimistic orders are not unconditionally removed when API requests fail, potentially leaving ghost orders in the indeterminate `_isUnconfirmed` state on timeouts.
- **Solution**: Modify the `catch` block in `flashClosePosition` in `tradeService.ts` to unconditionally call `omsService.removeOrder(clientOrderId)`. Create `src/services/reproduction_ghost_order2.test.ts` to verify the bug and fix.
- **Justification**: Prevents phantom data, measurably improving stability and adhering to the defensive programming memory.

### 2. Bounded Eviction in BitunixWS (🟡 WARNING)
- **Problem**: `bitunixWs.ts` caches `syntheticSubs` and `pendingSubscriptions` without size bounds, leading to potential memory leaks.
- **Solution**: Add bounds checking (e.g. `if (this.syntheticSubs.size > 5000)`) in the `subscribe` / `unsubscribe` path. Evict inactive entries by iterating over `.entries()` and deleting keys where `count === 0`. Do not blindly delete the first key.
- **Justification**: Measurably improves performance and prevents memory leaks during long-running sessions.

### 3. Localization of API Errors (🔵 REFACTOR)
- **Problem**: Raw API error messages potentially containing HTML are propagated from `tradeService.ts`.
- **Solution**: In `tradeService.ts`, sanitize `e.rawMessage`. If it includes `<html`, map it to `apiErrors.invalidResponse`. Add `apiErrors.invalidResponse` to `src/locales/locales/en.json`, `de.json`, and `src/locales/schema.d.ts`.
- **Justification**: Improves stability, UI presentation, and security by not exposing raw proxy HTML errors.

