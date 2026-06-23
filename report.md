# Code Analysis & Risk Report for cachy-app

## Status & Risk Report (Step 1)

### 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1. **Precision Loss in API Parsing & Serialization:**
   - **Finding:** Widespread use of native `JSON.parse()` instead of the custom `safeJsonParse()` utility (e.g., in `tradeService_flashClose.test.ts`, `apiService.ts`, `mdaService.test.ts`, `apiQuotaTracker.svelte.ts`).
   - **Risk:** Silent precision loss with large numeric IDs (e.g., 64-bit exchange IDs) and high-precision floats (Decimals). Native `JSON.parse` will destroy 19-digit integers, leading to critical financial miscalculations and failed order matching.
   - **Solution:** Enforce `safeJsonParse` across the board.

2. **Security Vulnerability: Unsafe Error Handling & Gateway Leaks:**
   - **Finding:** Use of raw `response.statusText`, non-JSON `text()` payloads, or API error `rawMessage` fields without HTML sanitization.
   - **Risk:** Exposing raw proxy error pages (with HTML) via `toastService` creates XSS vectors and leaks sensitive gateway details to users.
   - **Solution:** Catch parsing failures and map them to generic localized error keys (e.g., `apiErrors.invalidResponse`). Verify strings for HTML (e.g., `.toLowerCase().includes('<html')`).

3. **Type Safety Bypass in Error Handling:**
   - **Finding:** Widespread use of `catch (e: any)` in over 30 locations (e.g., `dataRepairService.ts`, `syncService.ts`, `newsService.ts`).
   - **Risk:** Bypasses TypeScript's type checking, which can lead to runtime crashes if `e` does not have an expected structure (e.g., `e.message`).
   - **Solution:** Replace `catch (e: any)` with `catch (e: unknown)` and properly type-narrow using `e instanceof Error ? e.message : String(e)`.

4. **Security Vulnerability: Unsanitized DOM Injection:**
   - **Finding:** Dynamic content rendered via `{@html}` in Svelte components without explicit sanitization.
   - **Risk:** Cross-Site Scripting (XSS) if data originates from external sources (e.g., news feeds, trade notes).
   - **Solution:** Ensure all `{@html}` content is strictly wrapped with `DOMPurify.sanitize()`.

5. **Inconsistent Decimal Handling:**
   - **Finding:** Floating point conversions casting Decimals back to native JavaScript floats (e.g., via `.toNumber()` or `Number(price.toString())`).
   - **Risk:** Floating point arithmetic inaccuracies causing incorrect trade sizing or price levels.
   - **Solution:** Maintain `Decimal` types end-to-end for all price and quantity calculations.

### 🟡 WARNING (Performance issue, UX error, missing i18n)

1. **Memory Leaks in Service Maps/Sets:**
   - **Finding:** Bounded eviction strategies are missing or incorrectly implemented. Evicting from reference-counted Maps by blindly removing the first key via `.keys().next().value` can corrupt active state.
   - **Risk:** Unbounded memory growth in caching Maps/Sets (e.g., `syntheticSubs`, `pendingSubscriptions`), leading to degraded performance.
   - **Solution:** Iterate via `.entries()` to safely evict only inactive entries (e.g., `val === 0`). Ensure complete teardown methods (`destroy()`) unconditionally call `.clear()` on all internal `Map` and `Set` collections.

2. **Timer Memory Leaks in TypeScript:**
   - **Finding:** Interval IDs typed as `any` or `number` instead of `ReturnType<typeof setInterval>` (e.g., `setInterval` calls in `omsService.ts`, `apiService.ts`, `bitunixWs.ts`).
   - **Risk:** Type unsafety across Node and browser environments, leading to potential un-cleared intervals.
   - **Solution:** Use `ReturnType<typeof setInterval>` and `ReturnType<typeof setTimeout>`.

3. **Missing i18n & Hardcoded Strings:**
   - **Finding:** Error messages from external APIs and internal errors are frequently hardcoded or passed raw to the user.
   - **Risk:** Suboptimal user experience for non-English speakers and non-actionable error messages.
   - **Solution:** Map known API errors to localized translation keys (e.g., `apiErrors.invalidResponseFormat`).

4. **Indeterminate State in Optimistic UI:**
   - **Finding:** Unconditional rollback of local state (e.g., `removeOrder`) during indeterminate backend API failures (like network timeouts).
   - **Risk:** Accidental double-ordering. If the exchange executed the order but the confirmation timed out, removing it locally creates a mismatch.
   - **Solution:** Retain optimistic orders and mark them as unconfirmed (`_isUnconfirmed = true`) for later reconciliation.

### 🔵 REFACTOR (Code smell, technical debt)

1. **Strict Type Safety for API Payloads:**
   - **Finding:** `any` type used for generic objects or API response payloads.
   - **Risk:** Obscures data structure and allows invalid property access.
   - **Solution:** Strictly use `Record<string, unknown>` or `unknown` and implement proper type narrowing. When dealing with `unknown` parsed via `safeJsonParse`, verify it is a non-null object before casting to `Record<string, unknown>`.

---

## Action Plan (Step 2)

### 1. JSON Parsing & Decimal Hardening
- **Justification:** Prevents catastrophic precision loss in financial data processing. Measurably improves system reliability.
- **Actions:**
  - Replace `JSON.parse` with `safeJsonParse` across `src/`.
  - Ensure all price/quantity calculations strictly maintain `Decimal.js` instances without downcasting to `number`.
- **Test Cases:**
  - Add unit test passing a 19-digit ID to verify `safeJsonParse` retains exact precision while `JSON.parse` fails.

### 2. Strict Type Safety & Error Handling Refactor
- **Justification:** Reduces runtime crashes by ensuring safe access to error properties and API payload data. Measurably improves stability.
- **Actions:**
  - Globally replace `catch (e: any)` with `catch (e: unknown)` and `const errMessage = e instanceof Error ? e.message : String(e);`.
  - Refactor `any` payload types to `unknown` or `Record<string, unknown>`.

### 3. Error Exposure & DOM Sanitization
- **Justification:** Closes critical XSS vectors and prevents exposing raw backend structures/HTML to users.
- **Actions:**
  - Audit `{@html}` tags in Svelte components and wrap with `DOMPurify.sanitize()`.
  - Sanitize `rawMessage` extraction: check for HTML (`.includes('<html')`) and map to `apiErrors.invalidResponse`. Throw localized error `apiErrors.invalidResponseFormat` on `response.text()` parse failures.

### 4. Memory Leak Remediation & Timer Typing
- **Justification:** Prevents long-running application degradation and crash loops due to unbounded memory allocation. Measurably improves performance.
- **Actions:**
  - Ensure all service teardown methods call `.clear()` on `Set` and `Map` structures.
  - Fix timer typing: enforce `ReturnType<typeof setInterval>`.
  - Refactor cache eviction logic to use `.entries()` and check for inactive entries instead of blindly deleting `.keys().next().value`.

### 5. Optimistic UI Reconciliation
- **Justification:** Prevents dangerous double-ordering during network timeouts. Measurably improves trading safety.
- **Actions:**
  - Update `omsService.ts` or order logic to set `_isUnconfirmed = true` instead of `removeOrder()` on timeout.
