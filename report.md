# In-depth Status & Risk Report

## 1. Data Integrity & Mapping

### 🔴 CRITICAL
* **TpSlOrder schema in TradeService:** `TradeService.fetchTpSlOrders` retrieves orders, but uses a loose generic cast (`as TpSlOrder[]`). There is no Zod validation (`TpSlOrderSchema.passthrough()` or safe parsing). This can lead to unverified payloads bypassing the TypeScript compiler, risking unexpected failures downstream.
* **TradeService Error Handling:** In `TradeService`, the API error `rawMessage` may contain HTML (from 502/503 proxies or WAFs). Line 295 exposes it directly to the UI, which violates memory guidelines ("Never expose raw `response.statusText`... or API error `rawMessage` fields containing HTML to the UI...").

### 🟡 WARNING
* **NewsService Error Handling:** In `NewsService`, `await res.text()` is called without being wrapped in a robust `try-catch` specific to streaming/reading errors. A connection drop during body download can throw uncaught exceptions.

## 2. Resource Management & Performance

### 🔴 CRITICAL
* **MarketWatcher Teardown:** The `destroy()` and `clear()` methods in `MarketWatcher` correctly call `.clear()` on multiple sets/maps, but if there are any synthetic/pending collections added recently or timers (`pollingTimeout`, `startTimeout`) they must be explicitly cleared to prevent memory leaks, per memory guidelines.

### 🟡 WARNING
* **Bounded Maps:** In `MarketWatcher`, check bounded eviction strategies. The `newsItems` in `NewsService` limits to 100 correctly, but other caching Maps might grow indefinitely if not properly evicted.

## 3. UI/UX & Accessibility (A11y)

### 🟡 WARNING
* **Hardcoded Strings / Missing i18n:** Need to scan for hardcoded text (e.g., in UI components, or literal string errors). Literal error strings should be replaced with centralized constants.
* **Broken States:** API failures for optimistic updates (in OMS) need to aggressively rollback local state. Memory explicitly mentions "always unconditionally roll back the local state (e.g., `removeOrder(clientOrderId)`) in the catch block".

## 4. Security & Validation

### 🔴 CRITICAL
* **DOMPurify / Markdown:** Check where markdown is rendered to ensure `renderSafeMarkdown` is used instead of `renderTrustedMarkdown` for untrusted content.
* **Catch Block Typings:** Check for `catch (e: any)`. E.g., `NewsService` has `catch (e: any)`. This must be refactored to `catch (e: unknown)` and properly type-narrowed.

# Action Plan

## 1. Hardening API Error Handling & Typing (🔴 CRITICAL)
- Refactor `catch (e: any)` to `catch (e: unknown)` in `NewsService.ts`.
- In `TradeService`, wrap `await response.text()` inside `signedRequest` in a `try-catch` to handle stream errors and throw a localized `apiErrors.invalidResponseFormat` if it fails.
- In `TradeService`, sanitize `rawMessage` before passing it to the UI. If `rawMessage.toLowerCase().includes('<html')`, fallback to `apiErrors.invalidResponse`.
- Add Zod schema validation for `fetchTpSlOrders` in `TradeService`. Use `TpSlOrderSchema.passthrough().safeParse`.

## 2. Hardening Optimistic UI & Resource Management (🔴 CRITICAL)
- In `omsService.ts`, unconditionally roll back local state in `catch` blocks for optimistic updates.
- Ensure all `Map` and `Set` collections in `MarketWatcher` and other singletons are explicitly `.clear()`ed on teardown.

## 3. Verification & Testing
- Run test suite focusing on modified services (e.g., `tradeService.test.ts`, `newsService.test.ts`).
- Ensure no regressions are introduced.
