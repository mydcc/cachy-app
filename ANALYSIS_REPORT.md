# Status & Risk Report: cachy-app

## 🔴 CRITICAL FINDINGS (Immediate Action Required)

### 1. Security: Unsafe `JSON.parse` in Server Routes
*   **Location:** `src/routes/api/sentiment/+server.ts`, `src/routes/api/ai/gemini/+server.ts`
*   **Issue:** The code directly uses `JSON.parse()` on response text from external AI services (Gemini/LLMs). If the AI returns malformed JSON or attacks, this will crash the server endpoint or potentially expose injection risks.
*   **Risk:** Server crash (DoS) or logic errors.
*   **Recommendation:** Switch to `safeJsonParse` (already available in utils) or `zod` schema parsing with try/catch.

### 2. Security: Potential XSS in Chart/Markdown Views
*   **Location:** `src/components/shared/ChartPatternsView.svelte`, `src/components/shared/CandlestickPatternsView.svelte`
*   **Issue:** Usage of `{@html renderTrustedMarkdown(...)}`. While the function name implies trust, if the content comes from external sources (patterns, news) and isn't strictly sanitized *inside* that function with DOMPurify, it's an XSS vector.
*   **Risk:** Cross-Site Scripting (XSS).
*   **Recommendation:** Verify `renderTrustedMarkdown` implements `DOMPurify.sanitize()`. If not, implement it immediately.

### 3. Financial Precision: "Fast Path" Numeric Casting
*   **Location:** `src/services/bitunixWs.ts` (Lines ~380-420), `src/services/marketWatcher.ts`
*   **Issue:** The WebSocket "Fast Path" optimization manually casts incoming data. For `ticker` and `price` updates, it checks `typeof data.lastPrice === 'number'`. While it converts to string, if the number *already* lost precision coming from `JSON.parse` (native JS behavior) before this check, the damage is done.
*   **Risk:** Financial data inaccuracy (e.g., price `0.00000001` becoming `0`).
*   **Recommendation:** Ensure `safeJsonParse` (which handles big numbers/decimals as strings) is used *before* the Fast Path, or ensure the Fast Path works on the raw string buffer if possible.

## 🟡 WARNINGS (High Priority)

### 1. Resource Management: WebSocket Zombie Instances
*   **Location:** `src/services/bitunixWs.ts`
*   **Issue:** The singleton pattern relies on `BitunixWebSocketService.activeInstance` and a manual `destroy()` call. If `destroy()` throws an error or fails to clear all timers (e.g., `pingTimerPublic`), multiple socket connections could run in parallel, flooding the API.
*   **Recommendation:** Wrap `destroy()` logic in a `try/catch` guarantees and ensure all `setInterval`/`setTimeout` handles are nullable and cleared.

### 2. UI/UX: `{@html}` Injection in Inputs
*   **Location:** `src/components/inputs/PortfolioInputs.svelte`
*   **Issue:** Uses `{@html icons.refresh || ...}`. While likely internal icons, mixing logic with HTML injection in input components is brittle.
*   **Recommendation:** Replace `{@html}` with component imports (e.g., `<RefreshIcon />`) or strictly sanitized SVG strings.

### 3. State Management: Unbounded Array Risks in Market Store
*   **Location:** `src/stores/market.svelte.ts`
*   **Issue:** `pendingKlineUpdates` and `pendingUpdates` maps are cleared on flush, but if the `flushInterval` (250ms) blocks or the UI thread freezes, these arrays grow indefinitely. The `limit` check exists but only logs a warning in DEV or forces a synchronous flush which might worsen the freeze.
*   **Recommendation:** Implement a hard cap (e.g., drop oldest updates) rather than just forcing a flush during high load.

## 🔵 REFACTOR (Technical Debt)

### 1. Hardcoded Strings & Magic Numbers
*   **Location:** `src/services/marketWatcher.ts`
*   **Issue:** Magic numbers for timeouts (`20000`, `10000`) and intervals.
*   **Recommendation:** Move to `CONSTANTS` or a config object.

### 2. Complex Polling Logic
*   **Location:** `src/services/marketWatcher.ts`
*   **Issue:** The polling loop with `staggerTimeouts` and `zombieRequest` pruning is highly complex and hard to test.
*   **Recommendation:** Simplify using a standard `RequestQueue` pattern.

---

**Next Steps (Phase 2 Plan):**
1.  **Fix Critical Security:** Replace `JSON.parse` and audit `{@html}`.
2.  **Harden Financial Logic:** Review `BitunixWs` parsing pipeline.
3.  **Optimize Resources:** Strengthen `destroy()` in WS and add hard caps in Stores.
