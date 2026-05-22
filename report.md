# Cachy-App Status & Risk Report (Institutional Grade Hardening)

Based on a comprehensive review of the `cachy-app` repository, focusing on financial standards, security, memory management, and data integrity, here is the prioritized list of findings.

## Data Integrity & Mapping

*   **TradeService API Responses:** In `src/services/tradeService.ts` (e.g., lines 530, 566), the `signedRequest` method is called with `<any>` for the response type for critical endpoints like `/api/tpsl`. This bypasses SvelteKit/TypeScript validation.
*   **Data Types:** `Decimal.js` is widely implemented, but mapping functions and custom APIs still receive floating-point structures that risk precision loss during the mapping transition, especially around `TpSlOrder` mappings.
*   **Error Catching:** There is widespread use of `catch (e: any)` (e.g., `syncService.ts`, `dataRepairService.ts`), which circumvents strict typing. In `TradeError` / `BitunixApiError`, `details?: any` is used, exposing the system to runtime type coercion errors.

## Resource Management & Performance

*   **Memory Leaks:**
    *   In `marketWatcher.ts`, `setTimeout` is used extensively for polling. While `staggerTimeouts` exists, the lack of complete bounded eviction strategies (e.g., pruning old items from `exhaustedHistory`) in cache Maps presents a persistent leak risk.
    *   Timeout IDs are sometimes typed loosely instead of strictly utilizing `ReturnType<typeof setTimeout>`.
*   **Hot Paths:** Calculations in Svelte `$state` and deep re-renders on rapid WebSocket emissions (via `BitunixWs`) are potentially executing complex UI updates during high-frequency volatility.

## UI/UX & Accessibility (A11y)

*   **Markdown Rendering:** `MarkdownView.svelte` uses `{@html renderTrustedMarkdown(win.content)}`. Based on repository memory, this is a known security vulnerability when handling untrusted data and must be replaced with the Svelte action `use:markdown`.
*   **Error Messages & i18n:** Raw string constants like `TRADE_ERRORS.FETCH_FAILED` are being thrown instead of mapped Svelte i18n localization keys, leading to broken UX states when APIs fail.

## Security & Validation

*   **XSS Vectors:** The raw DOM manipulation in Markdown rendering is the most prevalent security vulnerability.
*   **API Payloads:** There is a lack of Zod schema parsing (e.g., `.passthrough()`) for incoming `TpSlOrder` responses.

---

## Prioritized Findings

### 🔴 CRITICAL
1.  **XSS Vulnerability in Markdown Rendering:** `MarkdownView.svelte` uses `renderTrustedMarkdown` with `{@html ...}` which bypasses DOMPurify sanitization. Risk of XSS if untrusted content is displayed.
2.  **Missing Type Safety in API Payloads (TradeService):** Calls to `/api/tpsl` cast responses to `<any>` rather than enforcing Zod schema validation (e.g., `TpSlOrderSchema`), risking unexpected object shapes leading to phantom orders or crashes.

### 🟡 WARNING
1.  **Improper Error Typings:** Global use of `catch (e: any)` and error class constructors (e.g., `details?: any`) circumvents TypeScript compiler checks and can swallow unexpected errors silently.
2.  **Hardcoded Error Strings:** Raw error identifiers (like `TRADE_ERRORS.POSITION_NOT_FOUND`) lack localization key mapping, potentially resulting in raw or unhelpful errors being shown to the user on failure.
3.  **Timeout / Interval Typings:** Usage of `setTimeout` and `setInterval` without explicit `ReturnType` validation across `marketWatcher.ts` and `tradeService.ts`.

### 🔵 REFACTOR
1.  **Collection Eviction:** Implementing strict timestamp-based threshold eviction strategies (e.g., `now - prunedAt > AGE_THRESHOLD`) for internal caching Maps/Sets to prevent unbounded memory growth over prolonged sessions.

---

## Action Plan (Step 2 Preview)

Based on the findings from Step 1, here is a proposal for Step 2 execution:

1. **Security Fixes:** Refactor `MarkdownView.svelte` to use the `use:markdown` action to mitigate XSS vulnerabilities.
    * *Justification:* Measurably improves stability and security by preventing cross-site scripting attacks from external markdown injections.
2. **Strict Type Safety & Validation:** Implement Zod schemas (`TpSlResponseSchema`) in `src/types/apiSchemas.ts` for `/api/tpsl` and migrate `signedRequest<any>` to `signedRequest<unknown>` with `.safeParse()`.
    * *Justification:* Measurably improves stability by ensuring API payloads strictly conform to expected structures, preventing undefined reference crashes.
3. **TypeScript Error Hardening:** Globally replace `catch (e: any)` with `catch (e: unknown)` and `(e instanceof Error ? e.message : String(e))`, and update error classes to use `details?: unknown`.
    * *Justification:* Enforces strict error handling rules, guaranteeing deterministic fallback behaviors during network or API failure.
4. **Specific Unit Tests (Pre-Fix):** Implement a test verifying the XSS mitigation in DOMPurify/Markdown validation, and a test validating schema rejection for malformed `TpSl` orders prior to applying the fixes.
