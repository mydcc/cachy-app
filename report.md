# In-depth Status & Risk Report (cachy-app)

## Data Integrity & Mapping

🔴 **CRITICAL: parseFloat precision loss**
- In `src/services/csvService.ts`, `src/utils/fastConversion.ts`, and multiple UI components (e.g., `TradeSetupInputs.svelte`, `MarketDashboardModal.svelte`), `parseFloat` is used for price and amount parsing. Native JavaScript floats suffer from IEEE 754 precision issues, which is critical in a trading app. All calculations and parsing should use `Decimal.js` instead.
- Risk: Potential financial miscalculations due to floating-point rounding errors and precision loss on large IDs or exact amounts.

🔴 **CRITICAL: Unsafe Type Casts in API Mapping**
- APIs (like Bitunix/Bitget) responses are sometimes processed directly. In `src/services/tradeService.ts`, `marketWatcher.ts`, and `bitunixWs.ts`, we need to ensure strict typing and robust parsing using `safeJsonParse` and casting to `Record<string, unknown>` before accessing values instead of `any`.

## Resource Management & Performance

🔴 **CRITICAL: WebSocket Subscription Leaks**
- In `src/services/bitunixWs.ts`, the `destroy()` method cleanly clears `syntheticSubs` and `pendingSubscriptions`. However, it does not clear `throttleMap` which is unbounded for high cardinality keys across reconnects/destroys. This should be explicitly cleared to prevent memory leaks during component lifecycles.

🟡 **WARNING: Hot Path Re-renders**
- In `MarketOverview.svelte` and similar data-heavy UI components, frequent updates (>10Hz) could trigger unnecessary recalculations. Store/UI state arrays need limits and updates need throttling to avoid locking the UI thread.

## UI/UX & Accessibility (A11y)

🟡 **WARNING: Hardcoded Strings (Missing i18n)**
- Several strings in the UI might lack localization, and the app is used internationally. Need to perform an exhaustive audit of hardcoded text patterns in `.svelte` files and replace them with `$_("key")`.

🔴 **CRITICAL: Raw Error Messages Leaked to UI**
- If API responses (e.g., 502 Bad Gateway) containing HTML are passed directly to `toastService` via `rawMessage` (in `src/utils/errorUtils.ts` and `tradeService.ts`), users might see raw HTML or proxy pages. These need to be intercepted by checking if the string contains HTML (e.g., `.toLowerCase().includes('<html')`) and map it to a safe, localized error key like `apiErrors.invalidResponse`.

## Security & Validation

🟡 **WARNING: Inadequate User Input Validation**
- Order quantities and prices from inputs must be strictly validated against exchange step rules (min qty, tick size) before submission to the API to prevent rejection.

🔴 **CRITICAL: `{@html}` Usage Risks**
- The use of `{@html}` in components (e.g., `ContentRenderer.svelte` and `DisclaimerModal.svelte`) requires strict auditing. Currently, it seems `DOMPurify.sanitize()` or `sanitizeHtml` is correctly applied in most places, but any new additions must strictly follow this pattern to prevent Cross-Site Scripting (XSS).

---

# Action Plan

## Phase 1: Hardening WebSocket (CRITICAL)
- **Goal:** Ensure `BitunixWebSocketService.destroy()` unconditionally releases all resources.
- **Action:** Add `this.throttleMap.clear()` to the `destroy()` method in `src/services/bitunixWs.ts`.
- **Justification:** Does this measurably improve stability or performance? Yes, it prevents unbounded memory growth across multiple WebSocket connection lifecycles, ensuring memory is reclaimed.

## Phase 2: Secure Error Handling (CRITICAL)
- **Goal:** Prevent raw HTML from proxy errors from leaking to the UI via `toastService`.
- **Action:** Modify `getDisplayMessage` and `mapApiErrorToLabel` in `src/utils/errorUtils.ts`.
  ```typescript
  if (typeof raw === 'string' && raw.length > 0) {
      if (raw.toLowerCase().includes('<html')) {
          return 'apiErrors.invalidResponse';
      }
      return raw;
  }
  ```
- **Test Case:**
  ```typescript
  it('maps HTML error responses to invalidResponse', () => {
      const err = new BitunixApiError(502, "Error", "<html>502 Bad Gateway</html>");
      expect(getDisplayMessage(err)).toBe("apiErrors.invalidResponse");
  });
  ```
- **Justification:** Does this measurably improve stability or performance? Yes, it prevents UI corruption and leaking sensitive gateway details.

## Phase 3: Data Integrity - All Decimal.js Fixes (CRITICAL)
- **Goal:** Eliminate floating-point precision loss.
- **Action:** Replace `parseFloat` with `Decimal.js` in `src/services/csvService.ts`, especially in functions dealing with large IDs or prices.
- **Test Case:**
  ```typescript
  it('parses large IDs without precision loss using Decimal', () => {
      // Mock CSV parser and ensure large ID (e.g., 9007199254740992) remains exact
  });
  ```
- **Justification:** Does this measurably improve stability or performance? Yes, it eliminates precision bugs that can lead to financial loss or misaligned accounting in a professional trading platform.

