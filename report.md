# Code Analysis & Risk Report (cachy-app)

## Step 1: In-depth Analysis & Findings

Based on an in-depth scan of the repository, several issues have been identified that compromise institutional-grade reliability. These have been categorized based on severity.

### Data Integrity & Mapping
🔴 **CRITICAL:**
- **Floating Point Inaccuracies in WebSocket:** In `src/services/bitunixWs.ts`, there are uses of native `Number()` casting for timestamps and values (e.g. `Number(item.t ...)`). In financial applications, native floats can lead to precision loss on large integers or precise decimals.
- **Unsafe JSON Parsing:** Widespread usage of native `JSON.parse` instead of the required `safeJsonParse` utility. This occurs in UI stores (`ai.svelte.ts`, `settings.svelte.ts`, `quiz.svelte.ts`, `favorites.svelte.ts`, `indicator.svelte.ts`), API route responses (`src/routes/api/sync/orders/+server.ts`), and `src/services/apiService.ts` / `src/services/backupService.ts`. Native parsing silently truncates 64-bit integer IDs (like order IDs) resulting in phantom orders and broken state updates.

### Resource Management & Performance
🔴 **CRITICAL:**
- **Timer Memory Leaks in Services:** Several services (`marketWatcher.ts`, `bitunixWs.ts`, `newsService.ts`) use `setInterval` and `setTimeout` without type-safe bindings (`ReturnType<typeof setTimeout>`). Furthermore, if not meticulously cleared in `destroy()` or `onDestroy` blocks, these timers will continue running, resulting in CPU spikes, duplicate API calls, and memory exhaustion. For example, `bitunixWs.ts` creates multiple watchdog and reconnect timers.

### UI/UX & Accessibility (A11y)
🟡 **WARNING:**
- **Missing i18n & Raw Error Leaks:** In `src/services/newsService.ts` and `src/services/tradeService.ts`, API error responses are extracted raw via `await response.text()` or `response.statusText` and potentially surfaced to the user. This exposes raw HTML error proxy pages or unlocalized technical string messages to the UI.

### Security & Validation
🔴 **CRITICAL:**
- **Unsafe Try-Catch Typing:** In multiple locations (e.g. `src/services/newsService.ts`), catch blocks use `catch (e: any)`. This breaks type safety and exposes the app to runtime crashes if the caught object lacks expected properties (like `e.message`).
- **Unchecked API Responses:** `.text()` is called without wrapping it in a try-catch block in multiple places (e.g., `tradeService.ts`, `newsService.ts`), meaning a streaming failure or missing body will crash the immediate execution context.

---

## Step 2: Action Plan (Implementation)

The following groups detail the specific patches required to harden the platform.

### Group 1: Data Integrity & Safe Serialization (CRITICAL)
- **Safe JSON Parsing:** Replace `JSON.parse` with `safeJsonParse` in API routes (e.g., `src/routes/api/sync/orders/+server.ts`), the `apiService.ts`, and core Svelte stores (`settings.svelte.ts`, `ai.svelte.ts`, etc.) to prevent 64-bit precision loss.
- **Decimal Safety:** Ensure `bitunixWs.ts` and similar parsers rely solely on `Decimal.js` (or safe integer/string handling) for all financial numbers instead of `Number()` or `as number`.
- *Test Case Justification:* Run existing precision loss tests (e.g., `precision_loss.test.ts`) to prove `safeJsonParse` preserves 19-digit IDs correctly, and add a unit test in `bitunixWs.test.ts` to simulate handling a massive order ID.

### Group 2: Memory Leaks & Resource Management (CRITICAL)
- **Timer Type Safety:** Update all instances of `setInterval` and `setTimeout` in `marketWatcher.ts`, `bitunixWs.ts`, and `newsService.ts` to use `ReturnType<typeof setInterval>` and `ReturnType<typeof setTimeout>`.
- **Teardown Hardening:** Ensure `destroy()` or equivalent cleanup methods explicitly call `clearInterval` / `clearTimeout` for all active timers and `.clear()` on any Map/Set instances (e.g. synthetic subscriptions) to prevent phantom executions.
- *Test Case Justification:* Add a test in `bitunixWs.leak.test.ts` invoking `destroy()` and strictly asserting that private timer references are nullified and Maps evaluate to size `0`.

### Group 3: Hardening API Error Handling & Security (WARNING/CRITICAL)
- **Safe Error Unpacking:** Refactor `.text()` extractions in `tradeService.ts` and `newsService.ts` to be wrapped in a `try/catch` block. If parsing fails, throw a standard, localized fallback error.
- **Type-Safe Catch Blocks:** Replace `catch (e: any)` with `catch (e: unknown)` globally. Implement explicit type narrowing via `e instanceof Error ? e.message : String(e)`.
- **Masking Raw Errors:** Implement filtering for `.text()` responses to detect HTML structures (`.toLowerCase().includes('<html')`) and map them to localized `apiErrors.invalidResponse` keys.

### Refactoring Justification:
All proposed changes directly target critical bugs (precision loss in financial numbers, memory leaks causing app lag, and unhandled promises crashing services). These strictly adhere to the principle: "Does this measurably improve stability or performance?" and avoid purely cosmetic modifications.
