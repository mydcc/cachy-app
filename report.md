# In-Depth Code Analysis Report - Cachy-App (Systematic Maintenance & Hardening)

## Prioritized Findings

### 🔴 CRITICAL: Risk of financial loss, crash, or security vulnerability.
1. **Error Handling & Raw API Output (Security/UX):**
   - *Issue:* In `TradeService` (e.g., lines 347, 495), `e.rawMessage` is directly sent to the UI via `toastService.error` or returned as `errMsg`.
   - *Impact:* `rawMessage` might contain HTML or internal gateway errors (e.g., 502 Bad Gateway Nginx HTML pages) and can cause XSS if rendered via `{@html}` or expose sensitive internal infrastructure details.
2. **Memory Leaks in WebSockets (Resource Management):**
   - *Issue:* In `bitunixWs.ts`, maps like `syntheticSubs` and `pendingSubscriptions` are not systematically cleaned up when connections are interrupted.
   - *Impact:* Unbounded memory growth on long-running processes during frequent API disconnects/reconnects.
3. **XSS Vulnerabilities with `{@html}` (Security):**
   - *Issue:* Several Svelte components (e.g., `DialogView.svelte`, `MarkdownView.svelte`) use `{@html win.message}` or `{@html renderTrustedMarkdown()}`. Others like `ContentRenderer.svelte` use `{@html displayContent}` without clear sanitization on the component level.
   - *Impact:* If input validation fails or user input leaks into these states, it allows cross-site scripting (XSS).

### 🟡 WARNING: Performance issue, UX error, missing i18n.
1. **Decimal.js Usage & Floating Point Risks (Data Integrity):**
   - *Issue:* `any` is prevalent in data mapping within `TradeService`, particularly in `serializePayload` and request typings (`signedRequest<any>`).
   - *Impact:* Bypasses type safety for critical logic, risking loss of decimal precision during mapping if not carefully managed.
2. **Store Array Bounds (Performance):**
   - *Issue:* In stores like `journal.svelte.ts` and `floatingWindows.svelte.ts`, `.push()` is used without length limits.
   - *Impact:* Arrays can grow indefinitely in memory over long user sessions.
3. **Missing i18n (UX):**
   - *Issue:* Numerous hardcoded string literals used with `toastService.error` (e.g., in `marketAnalyst.ts`, `calculationStrategy.ts`).
   - *Impact:* Poor experience for non-English speakers.

### 🔵 REFACTOR: Code smell, technical debt (only list if it massively compromises stability/maintainability).
1. **Unbounded Throttle Maps:**
   - *Issue:* The `throttleMap` in WS services relies on manual checks (`if size > 1000 clear()`).
   - *Impact:* It's a crude eviction strategy. A proper LRU cache or TTL-based map would improve stability.

---

# Step 2: Action Plan (Planning Phase)

1. **All XSS & Error Message Leakage Fixes**
   - *Justification:* Improves security drastically by preventing XSS and leaking internal network structure.
   - *Proposed Unit Test (CRITICAL):*
     ```typescript
     it('should map HTML rawMessage to localized apiErrors.invalidResponse key', () => {
       const error = new BitunixApiError(502, "Bad Gateway", "<html><body>502 Bad Gateway</body></html>");
       // Mock toastService and trigger closePosition failure
       expect(toastService.error).toHaveBeenCalledWith('apiErrors.invalidResponse');
       expect(toastService.error).not.toHaveBeenCalledWith(expect.stringContaining('<html>'));
     });
     ```
   - *Action:* Modify `TradeService` to catch and map `rawMessage` to safe, localized error keys if HTML is detected. Wrap `{@html}` usages in missing components with `DOMPurify.sanitize()`.

2. **Harden WebSocket Memory Management**
   - *Justification:* Prevents memory starvation during high-frequency API disconnects/reconnects.
   - *Proposed Unit Test (CRITICAL):*
     ```typescript
     it('should strictly clear syntheticSubs and pendingSubscriptions on connection failure/reconnect', () => {
         const ws = new BitunixWebSocketService();
         ws['syntheticSubs'].set('eth-usdt', 1);
         ws['pendingSubscriptions'].set('sub-key', 1);
         ws.disconnect(); // Trigger cleanup
         expect((ws as any).syntheticSubs.size).toBe(0);
         expect((ws as any).pendingSubscriptions.size).toBe(0);
     });
     ```
   - *Action:* Implement strict eviction logic and ensure full cleanup of `Map` collections during reconnection events in `bitunixWs.ts`.

3. **Refactor 'any' Types in TradeService**
   - *Justification:* Guarantees financial calculation safety.
   - *Action:* Replace `any` with `unknown` or `Record<string, unknown>` and type-narrow.

4. **All i18n Fixes**
   - *Justification:* Improves UX for non-English speakers and maintains application consistency.
   - *Action:* Identify hardcoded strings in `toastService.error` calls and map them to `$_("...")` translation keys.

5. **Execute Tests**
   - *Action:* Run test suites using `npm run check && npm run test` to ensure no regressions were introduced.
