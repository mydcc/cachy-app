# In-depth Status & Risk Report: cachy-app

## Overview
This report assesses the current state of the cachy-app repository, an institutional-grade high-frequency trading platform. The focus is on finding vulnerabilities, regressions, memory leaks, and other non-cosmetic issues impacting stability and performance.

## Findings

### 1. Data Integrity & Mapping

🔴 **CRITICAL: Unsafe Type Assertions and `any` Usage**
- In `src/services/tradeService.ts`, `data: any = {}` is used for parsed text (line 124), `serializePayload` returns `any` (line 150), `params: any = {}` (line 527), and requests to `/api/tpsl` use generic `<any>` types (line 530, 566).
- In `src/services/newsService.ts`, mapping responses blindly uses `any` (e.g. `item: any` in map functions at line 269, 326), `params: any = {}` (line 232), and multiple `catch (e: any)` blocks exist which break type safety when accessing `e.message` (line 283, 340, 508).
- `src/services/apiService.ts` contains raw type casting (`res.map((k: any) => ...)` at line 519, `res.map((kline: any) => ...)` at line 667, `res.data.map((ticker: any) => ...)` at line 789, `data.map((t: any) => ...)` at line 812), and `let errData: any = {};` at line 631.

🔴 **CRITICAL: Decimal.js Type Safety**
- While Decimal.js is used, `any` typings during API response parsing or payload serialization risk silent type coercion or precision loss if `any` falls back to raw number floats before being converted to `Decimal`. The serialization in `tradeService.ts` checks for `instanceof Decimal` and `.isDecimal()` but this safety depends on `payload` being tracked correctly which is jeopardized by `.any`.

### 2. Resource Management & Performance

🔴 **CRITICAL: Missing Clear on `.destroy()` Methods (Memory Leaks)**
- In `src/services/marketWatcher.ts`, `public destroy()` (line 777) calls `.clear()` on `requests`, `pendingRequests`, `requestStartTimes`, `exhaustedHistory`, `prunedRequestIds`, `historyLocks`, and `staggerTimeouts`. However, it does not clean up the `channels: Set<string>` or `activeConnections` / `subscriptions` if managed natively or via external sockets correctly, though `marketWatcher` relies on `BitunixWs`.
- Need to check if `src/services/tradeService.ts` or other singleton classes implement a clean teardown to prevent zombie processes.
- Eviction bounds in `marketWatcher.ts` (line 232) blindly clear the entire `exhaustedHistory` and `.keys().next().value` is potentially used for `.prunedRequestIds`, but `clear()` on `exhaustedHistory` wipes state instead of bounded eviction.

### 3. UI/UX & Accessibility (A11y)

🟡 **WARNING: Unsafe Error Handling & Missing Translations**
- In `src/services/tradeService.ts`, `BitunixApiError.rawMessage` might contain HTML or generic server error strings that get surfaced to the UI if not mapped to localized `apiErrors.*` (e.g., `trade.fetchFailed` in `toastService.error`). The `rawMessage` logic in `catch` blocks (line 535) preserves raw messages without stripping HTML which could bleed into `toastService`.
- In `src/services/tradeService.ts`, `tradeErrors.fetchFailed` might be hardcoded or missing in `en.json` (as per `tradeErrors` check, `fetchFailed` is missing, only `positionNotFound`, `positionMismatch`, `dataError` are present).

### 4. Security & Validation

🔴 **CRITICAL: Potential XSS Vectors with @html and Untrusted Markdown/Error Messages**
- Several components use `{@html ...}`.
- In `src/lib/windows/implementations/MarkdownView.svelte`, `renderTrustedMarkdown(win.content)` is used directly on window content. If `win.content` is untrusted or comes from external sources without prior sanitization, this is an XSS vector. The memory rule explicitly states: "For rendering Markdown from potentially untrusted sources ... use the `markdown` action (`use:markdown={content}`) from `src/actions/markdown.ts` ... Avoid `renderTrustedMarkdown` for untrusted content."
- `DOMPurify` is used in `sanitizeHtml` (`src/lib/utils/sanitizer.ts`), but error messages containing HTML (e.g. `rawMessage` from a 502 Proxy Error) could bypass checks if they are logged or surfaced via toast directly instead of going through localization keys.
