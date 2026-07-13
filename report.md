# cachy-app - Status & Risk Report (Institutional Grade Analysis)

## 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1. **Unsafe API Response Serialization (REST/WebSocket)**
   - *Issue*: Floating point precision loss in calculations. While `Decimal.js` is used in tests and `charts.ts`, there are numerous instances where Decimals are downcast to standard JavaScript `Number` or where `Number()`/`parseFloat()` is used directly on prices, sizes, and volumes. Examples found in `SymbolPickerView.svelte`, `CandleChartView.svelte`, and `charts.ts`.
   - *Impact*: In high-frequency trading or when dealing with highly fractional amounts, floating-point inaccuracies can lead to wrong order sizes, incorrect profit calculations, and ultimately financial loss.

2. **Raw Error Message Exposure via UI (XSS / Info Disclosure Risk)**
   - *Issue*: `BitunixApiError.rawMessage` is passed directly for display if present (e.g., in `tradeService.ts`). The memory instructions clearly state: "Never expose raw `response.statusText`, non-JSON `text()` payloads, or API error `rawMessage` fields containing HTML to the UI or standard logs".
   - *Impact*: If the API gateway returns a proxy HTML error page (e.g., 502 Bad Gateway with raw HTML), the UI could crash, leak sensitive gateway details, or expose users to XSS if displayed unsafely.

3. **Unsafe Cache Eviction (`.keys().next().value`)**
   - *Issue*: Cache eviction using `.keys().next().value` is used in `apiService.ts`, `rss-fetch/+server.ts`, and `external/news/+server.ts`. For reference-counted caches, blindly removing the first key without checking activity corrupts application state.
   - *Impact*: Active caches/subscriptions might be prematurely deleted, causing data stalls or unpredictable behavior in live systems.

4. **Missing/Incorrect Catch Typing (`catch (e: any)`)**
   - *Issue*: Found multiple instances of `catch (e: any)` (e.g., `ai.svelte.ts`, `settings.svelte.ts`, `csvService.ts`).
   - *Impact*: Typescript compiler does not enforce safety on `e`. This bypasses strict typing and can lead to runtime crashes if `e.message` is accessed when `e` is not an `Error` object.

## 🟡 WARNING (Performance issue, UX error, missing i18n)

1. **Memory Leaks in Collections / Subscriptions**
   - *Issue*: Some stores or managers do not guarantee full `.clear()` on disposal. Found `market.svelte.ts` calling `.clear()` on `pendingUpdates` but other components/services with `Map` or `Set` might not correctly clear resources on `destroy()`.
   - *Impact*: Unbounded memory growth, especially with hot paths like WebSockets receiving numerous updates. Over time, this leads to lag and browser crashes for long-running trader sessions.

2. **Unsanitized `{@html}` tags**
   - *Issue*: Instances of `{@html}` are used across several components (`DashboardNav.svelte`, `ToastItem.svelte`, `SummaryResults.svelte`). While some are hardcoded icons, others could be dynamic. Any dynamic content not strictly wrapped in `DOMPurify.sanitize()` poses an XSS risk.
   - *Impact*: Malicious payloads from news feeds, order descriptions, or user input could execute scripts in the user's browser.

3. **Inconsistent Error UX & Missing i18n**
   - *Issue*: Hardcoded strings were seen instead of using localized mapping (e.g., mapping unknown API errors to `apiErrors.invalidResponse`). "Actionable error messages" are missing for edge cases like indeterminate network timeouts.
   - *Impact*: Users receive confusing, un-actionable, or unlocalized error messages (e.g., "Network Error") without knowing what to do next.

## 🔵 REFACTOR (Code smell, technical debt)

1. **Optimistic UI Indeterminate States (Order Handling)**
   - *Issue*: Indeterminate API failures (e.g., network timeouts during order placement) should not blindly revert optimistic state. Found traces of handling this in `tradeService.ts`, but needs to be rigorously enforced across all OMS interactions. Removing unconfirmed orders may cause double-ordering.
   - *Impact*: Measurably impacts stability during high volatility and network congestion.

2. **Strict TypeScript Enforcement for Parsed Data**
   - *Issue*: `safeJsonParse` sometimes assigns to variables where structure is not strictly validated before accessing properties. Casting `unknown` API responses to `Record<string, unknown>` before access is safer.
   - *Impact*: Improves maintainability and resilience against unexpected API payload schema changes.

# Action Plan

1. **All i18n and UI Safety fixes**
   - Use `DOMPurify.sanitize()` where dynamic `{@html}` is used.
   - Refactor error messages to not leak `rawMessage` if it contains HTML or proxy errors, mapping them to `apiErrors.invalidResponse` and catching `unknown` API responses effectively.
   - Replace generic `catch (e: any)` with `catch (e: unknown)` and properly type-narrow `e instanceof Error ? e.message : String(e)`.
   - *Justification*: Prevents XSS vulnerabilities, ensures localized, actionable error UX, and measurably improves application stability by avoiding runtime crashes on string operations.

2. **Data Integrity & Decimal Refactoring**
   - Eliminate direct usage of `Number()` or `parseFloat()` when handling sensitive financial data (prices, quantities).
   - Ensure `Decimal.js` instances are not downcast to numbers in core logic pathways, maintaining end-to-end Decimal precision.
   - Use `safeJsonParse` consistently and strictly type validate its `unknown` return.
   - *Unit Test Suggestion (CRITICAL)*: Add a test case mimicking a large, highly fractional order quantity and a high-precision price (e.g., `88480.12345678901234567890`) crossing the REST/WS boundary. Assert that parsing and state logic preserves the exact string representation via `Decimal`, and assert that it correctly blocks any attempt to revert to a floating-point number.
   - *Justification*: Prevents silent precision loss during data mapping, avoiding financial damage resulting from incorrect trade sizing.

3. **Memory & Performance Hardening**
   - Refactor cache eviction logic in `apiService.ts`, `rss-fetch`, and `news` server routes. Instead of `.keys().next().value`, use `.entries()` to find and remove only inactive entries (e.g., `value === 0` for ref counts).
   - Ensure robust teardown in stores (like `market.svelte.ts`) by calling `.clear()` on all Map/Set collections inside `destroy()`.
   - Implement retention of optimistic orders during indeterminate backend failures (e.g., set `_isUnconfirmed = true` instead of deleting) to prevent double ordering.
   - *Justification*: Measurably improves performance and stability by eliminating memory leaks and avoiding accidental order duplication under high-load or flaky network conditions.
