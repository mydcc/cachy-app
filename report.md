# Status & Risk Report (cachy-app)

## 1. Data Integrity & Mapping

### 🔴 CRITICAL
- **Decimal.js enforcement:** Several places cast strings or Decimal wrappers directly to `Number()` (e.g., `src/services/mdaService.ts:102` `time: Number(k.time || ...)` and `src/services/mappers.ts:114` `timestamp: Number(...)`). Timestamps are mostly fine as `Number`, but other price/volume properties might be at risk. More importantly, numeric IDs from API responses being run through `JSON.parse` rather than `safeJsonParse` causes 19-digit IDs to lose precision before checks can happen (`src/services/mappers.ts`, `src/services/backupService.ts`).
- **Unsafe Error Handling & Type Bypasses:** Found 37 occurrences of `catch (e: any)` across services and components (e.g., `src/services/newsService.ts`, `src/routes/api/tpsl/+server.ts`). This bypasses TypeScript and can lead to runtime crashes if `e` is not an Error object and `e.message` is accessed.

### 🟡 WARNING
- **Raw API messages exposing HTML:** `tradeService.ts:297` uses `e.rawMessage` for UI display without sanitization. If the proxy/gateway returns a 502 HTML error page, this exposes raw HTML to the user via `toastService`, which is a bad UX and potential XSS if rendered via `{@html}`.

## 2. Resource Management & Performance

### 🔴 CRITICAL
- **Memory Leaks in Collections:** `bitunixWs.ts` and other WebSocket services use `Map` and `Set` (like `pendingSubscriptions`). While `.clear()` is called on destroy, unbounded arrays or Maps in high-frequency data streams need bounded eviction to prevent OOM issues.

### 🟡 WARNING
- **Throttling and Re-renders:** Active technicals managers and polling loops have basic throttling, but hot paths need strict validation. Throttling of UI updates in `bitunixWs.ts` relies on `throttleMap` which needs careful cleanup of inactive entries instead of naive map key removal.

## 3. UI/UX & Accessibility (A11y)

### 🟡 WARNING
- **{@html} Usage:** The app makes heavy use of `{@html}` for icons and DOM insertion (e.g., `src/components/shared/ChartPatternsView.svelte`, `src/components/results/SummaryResults.svelte`). Not all usages appear to be wrapped in `DOMPurify.sanitize()`, which is required according to memory rules.
- **Unlocalized Errors:** Some exceptions fallback to hardcoded strings like `"TradeError"` or raw API payloads rather than strictly using i18n keys (e.g., `tradeErrors.positionNotFound`).

## 4. Security & Validation

### 🔴 CRITICAL
- **XSS via unpurified {@html} & e.rawMessage:** If an error contains raw HTML and is shown via `toastService` using an unpurified `{@html}` tag somewhere in the UI, this is a serious vulnerability.
- **JSON Parsing Risks:** `JSON.parse()` is still used in files like `backupService.ts` and `tradeService_flashClose.test.ts` directly. `safeJsonParse()` must be used strictly across the board.

---

# Step 2: Action Plan

## Phase 1: Security & Stability Hotfixes (CRITICAL)
1. **Fix `catch (e: any)` Type Bypasses:**
   - Search and replace `catch (e: any)` with `catch (e: unknown)`.
   - Implement type narrowing: `e instanceof Error ? e.message : String(e)`.
   - *Justification:* Measurably improves runtime stability by preventing `TypeError` when external libraries or APIs throw non-Error objects.
2. **Harden JSON Parsing & Large Numbers:**
   - Replace native `JSON.parse` with `safeJsonParse` in `backupService.ts`, `tradeService_flashClose.test.ts` and other occurrences.
   - *Test Case:* Write a unit test verifying that a 19-digit numeric ID in JSON is parsed exactly without precision loss.
   - *Justification:* Measurably improves data integrity and prevents corrupted order IDs leading to financial errors.

## Phase 2: UX & Resource Hardening (WARNING & REFACTOR)
3. **Sanitize Raw Error Messages:**
   - Update `tradeService.ts` (and similar files) to check if `e.rawMessage` contains HTML (e.g., `.toLowerCase().includes('<html')`). If it does, map it to a generic localized error key like `apiErrors.invalidResponse`.
   - *Justification:* Prevents leaking gateway details and raw HTML, improving UX and security.
4. **Audit and Purify `{@html}`:**
   - Ensure all dynamic content rendered via `{@html}` (especially outside of hardcoded icons) uses `DOMPurify.sanitize()`.
   - *Justification:* Measurably improves security against XSS.
5. **Memory Leak Prevention in Collections:**
   - Ensure `bitunixWs.ts` and `bitgetWs.ts` clean up their `Map` collections properly. When evicting from `throttleMap` or `pendingSubscriptions`, use `.entries()` to remove only inactive ones.
   - *Justification:* Measurably improves stability and prevents unbounded memory growth during long trading sessions.

## Phase 3: Final Verification
6. **Execute Tests:**
   - Run `PUPPETEER_SKIP_DOWNLOAD=true npm install && npx svelte-kit sync && npm run check && npm run test` to ensure no regressions were introduced.
7. **Complete pre-commit steps:**
   - Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
