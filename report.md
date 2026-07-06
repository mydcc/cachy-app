# In-Depth Code Analysis & Hardening Report

## 🔴 CRITICAL

### 1. Data Integrity & Type Safety: Precision Loss in API Serialization (`TradeService`)

- **Finding:** In `TradeService` (`src/services/tradeService.ts`), the `signedRequest` method uses `JSON.stringify(serializedPayload)`. While `serializePayload` serializes Decimal objects, if large integers (like order IDs) or Decimals are passed as numbers and `fetch().text()` is parsed using native `JSON.parse()`, precision loss will occur.
- **Risk:** High-frequency trading requires absolute precision. Precision loss on order IDs or crypto amounts can lead to incorrect order execution, orphan positions, or financial loss.
- **Action Plan (Step 2 - Hardening):**
    - Migrate all backend REST fetch responses (e.g., `tradeService.ts`, `syncService.ts`) to use `safeJsonParse` instead of `JSON.parse` or `.json()`.
- **Unit Test to Reproduce:**
  ```typescript
  it("should fail gracefully and maintain string types for large IDs when using safeJsonParse", async () => {
      const mockResponse = '{"orderId": 1234567890123456789, "price": 0.0000000001}';
      // Native JSON.parse would corrupt the orderId to 1234567890123456800.
      const parsed = safeJsonParse(mockResponse);
      expect(typeof parsed.orderId).toBe("string");
      expect(parsed.orderId).toBe("1234567890123456789");
  });
  ```

### 2. Unsafe DOM Manipulation: XSS Vulnerability via `{@html}`

- **Finding:** Numerous Svelte components (`SummaryResults.svelte`, `DisclaimerModal.svelte`, etc.) use the `{@html ...}` directive without explicitly sanitizing the input via `DOMPurify`.
- **Risk:** Cross-Site Scripting (XSS). If any raw API error messages, RSS feeds, or stored values contain malicious scripts, they will be executed in the user's browser, potentially leading to session hijacking.
- **Action Plan (Step 2 - Hardening):**
    - Wrap all dynamic `{@html}` bindings with `DOMPurify.sanitize()` (e.g., `{@html DOMPurify.sanitize(content)}`).
- **Unit Test to Reproduce:**
  ```typescript
  it("should strip malicious script tags from DisclaimerModal content", () => {
      const maliciousPayload = "<script>alert('xss')</script><p>Disclaimer</p>";
      const sanitized = sanitizeHtml(maliciousPayload); // Assuming utility wraps DOMPurify
      expect(sanitized).not.toContain("<script>");
      expect(sanitized).toContain("<p>Disclaimer</p>");
  });
  ```

### 3. Exposure of Raw API Errors to UI

- **Finding:** The `BitunixApiError` captures `rawMessage`. In `tradeService.ts`, if the API proxy fails (e.g., Cloudflare 502), the `rawMessage` might contain raw HTML. This is exposed to the UI via `toastService`.
- **Risk:** Exposing raw HTML strings to the UI is poor UX and risks rendering raw tags if un-sanitized, or exposing sensitive gateway details to the end-user.
- **Action Plan (Step 2 - Hardening):**
    - Check if `BitunixApiError.rawMessage` contains HTML (e.g., `.toLowerCase().includes('<html')`) and map it to a safe, generic localized key like `apiErrors.invalidResponse`.
- **Unit Test to Reproduce:**
  ```typescript
  it("should intercept HTML in BitunixApiError and map to safe i18n key", () => {
      const error = new BitunixApiError(502, "Error", "<html><body>502 Bad Gateway</body></html>");
      const uiMessage = extractSafeErrorMessage(error);
      expect(uiMessage).toBe("apiErrors.invalidResponse");
  });
  ```

### 4. Memory Leaks in Collections (`MarketWatcher`, `NewsService`)

- **Finding:** Services with long-lived lifecycles (like `MarketWatcher`) use Sets and Maps (e.g., `requests`, `pendingRequests`) but might not explicitly `.clear()` them during their `destroy()` or teardown phases.
- **Risk:** Unbounded memory growth, especially in SPAs running for days, leading to performance degradation and eventual browser crash (OOM).
- **Action Plan (Step 2 - Hardening):**
    - Implement a strict teardown method (`destroy()`) that unconditionally calls `.clear()` on all caching Maps and Sets.
- **Unit Test to Reproduce:**
  ```typescript
  it("should clear all pending subscriptions and locks upon destroy", () => {
      marketWatcher.register("BTCUSDT", "price");
      marketWatcher.destroy();
      expect(marketWatcher.getPendingRequestsSize()).toBe(0);
      expect(marketWatcher.getHistoryLocksSize()).toBe(0);
  });
  ```

## 🟡 WARNING

### 1. Indeterminate Backend API Failures (Optimistic UI)

- **Finding:** In `TradeService`, if a network timeout occurs during an optimistic UI operation (e.g., placing an order), the local state might be unconditionally rolled back.
- **Risk:** If the exchange actually executed the order but the response timed out, the local app will show no order. The user might submit the order again, leading to double execution (financial risk).
- **Action Plan (Step 2 - Hardening):**
    - Retain optimistic orders on timeout and mark them as `_isUnconfirmed = true` for later reconciliation via WebSocket or SyncService.

### 2. Missing i18n Keys and Hardcoded Strings

- **Finding:** Hardcoded English strings might be used in error boundaries or toast notifications instead of localized `_('key')` variables.
- **Risk:** Poor UX for non-English users.
- **Action Plan (Step 2 - Hardening):**
    - Audit and replace hardcoded UI strings with i18n keys.

## 🔵 REFACTOR

### 1. Consistent usage of `safeJsonParse`

- **Finding:** `JSON.parse` is used in `apiQuotaTracker.svelte.ts`, `backupService.ts`, and `wasmCalculator.ts`.
- **Justification:** "Does this measurably improve stability or performance?" Yes, replacing native `JSON.parse` with `safeJsonParse` improves stability by ensuring large IDs from the blockchain or APIs are not silently corrupted, preventing data integrity issues across the entire platform.
- **Action Plan (Step 2 - Hardening):**
    - Replace all `JSON.parse` calls with `safeJsonParse` globally.
