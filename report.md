# Status & Risk Report
## 🔴 CRITICAL
### Data Integrity & Mapping
- **Floating Point Risks:** Multiple services (e.g. `csvService.ts`, `MarketOverview.svelte`, `fastConversion.ts`) use `parseFloat`, `Number()`, or downcast `Decimal` objects via `.toNumber()`. This risks precision loss in financial calculations. `Decimal.js` should be used exclusively.
- **API Error Handling:** `safeJsonParse` is not consistently used. Raw JSON parsing is found in `backupService.ts` and `wasmCalculator.ts`. `response.text()` in API endpoints (e.g. `apiService.ts`, `newsService.ts`, `tradeService.ts`) is not properly wrapped in `try/catch` block to handle text stream failure, violating the strict defensive programming guidelines.
- **Memory Leaks in WebSockets:** `bitunixWs.ts` or similar services may fail to use `.clear()` on `Map` or `Set` structures during teardown, leading to unclosed subscriptions or growing memory during long-running sessions.
- **Uncaught typed errors:** Widespread usage of `catch (e: any)` bypasses TypeScript. `e instanceof Error ? e.message : String(e)` should be used per memory guidelines.
## 🟡 WARNING
### UI/UX & Accessibility (A11y)
- **Unsanitized HTML in Svelte:** `{@html}` tags are heavily used (e.g., icons, dashboard components, tooltips). While some use `DOMPurify.sanitize()`, others (especially icons and dynamic market overview data) are directly rendered without sanitization, posing XSS vulnerabilities.
- **Error Messages:** Several error messages may expose raw HTML or gateway error details (e.g., `response.statusText` or `BitunixApiError.rawMessage`) to the UI instead of falling back to user-friendly `i18n` keys like `apiErrors.invalidResponse`.
- **Broken States:** When API throws 500 error or there's network interruption, error handling logic doesn't gracefully mask raw backend output, causing degraded UX.
## 🔵 REFACTOR
### Resource Management & Performance
- **Hot Paths & Re-renders:** Active technicals managers and chart UI threads process heavy payloads per tick. Some internal logic loops or relies on non-performant type casting instead of native WebAssembly/WebGPU endpoints exclusively.

# Action Plan

## 1. Hardening WebSocket and Memory Leaks
- Modify teardown or destroy methods (e.g. `destroy()`) in `src/services/bitunixWs.ts` and related managers. Unconditionally call `.clear()` on `Set` and `Map` structures to eliminate memory leaks and ensure unclosed subscriptions are cleared properly.
- Update reference-counted maps to iterate via `.entries()` and conditionally `.delete(key)` based on activity level, instead of blind eviction.

## 2. All i18n Fixes & Raw Error Handling
- Refactor error processing logic in `apiService.ts`, `newsService.ts`, and `tradeService.ts`. Ensure `response.text()` responses inside `try/catch` and use `apiErrors.invalidResponseFormat` on parsing failure.
- Map gateway outputs such as `response.statusText` to user-friendly messages and prevent raw `HTML` error text from propagating to the UI.

## 3. Strict Type Safety and Input Validation
- Replace `catch (e: any)` with `catch (e: unknown)` and properly use `e instanceof Error ? e.message : String(e)` site-wide, especially in data repair logic, jules service, news and active technicals components.
- Standardize `.toNumber()` casting and replace `Number(price)` and `parseFloat(val)` in critical calculation logic (like `activeTechnicalsManager.svelte.ts`) with robust `Decimal.js` operations, enforcing exact precision requirements.

## 4. XSS & Sanitation Refactoring
- Sanitize all instances of `{@html}` using `DOMPurify.sanitize()` where dynamic content is used, particularly in tooltip implementations, side panels, journal content, and shared overview components, thereby preventing unescaped characters.

### Justifications
- **Hardening WebSocket:** Measurably improves stability by preventing memory bloat and deterministic resource release.
- **Strict Type Safety:** Measurably improves stability by removing unpredictable type exceptions and mathematical inaccuracies over floating-point arithmetic.
- **XSS & Sanitation:** Ensures system integrity against potential payload-based exploits from untrusted inputs in the dashboard or components.

### Suggested Test Cases for Critical Logic Errors
1. **Float precision error:** Unit test feeding a sub-cent high-precision price to calculation inputs, verifying that an exact `Decimal.js` representation avoids rounding variations compared to JS native floats.
2. **WebSocket leak test:** Instantiating `bitunixWs`, subscribing to 10k synthetic ticks, calling `destroy()`, and explicitly asserting `.size === 0` on subscription mapping structures.
