# In-Depth Status & Risk Report (Analysis Phase)

## 🔴 CRITICAL

1. **Security Vulnerability (XSS via unisolated DOMPurify/sanitizeHtml):**
   - **Location:** `src/components/settings/SettingsContent.svelte` (`{@html tab.icon}`) does not wrap its contents with DOMPurify or the custom `sanitizeHtml` function.
   - **Risk:** High risk of Cross-Site Scripting (XSS) if tab data comes from an untrusted source or user input.
   - **Resolution Needed:** Wrap `tab.icon` and any `{@html ...}` usages in Svelte strictly with `DOMPurify.sanitize()` or the internal `sanitizeHtml()`.

2. **Logic Errors & Defensive Programming (Catch Blocks using `any` / Missing Explicit Type-Narrowing):**
   - **Location:** Multiple places in `src/services/tradeService.ts`, `src/services/activeTechnicalsManager.svelte.ts`, and `src/services/marketWatcher.ts`. E.g., `src/services/activeTechnicalsManager.svelte.ts` line 73: `catch (e: any)`.
   - **Risk:** Accidental exposure of raw errors/HTML strings to the UI, bypassing the strict type checks. Memory/Rule violation.
   - **Resolution Needed:** Refactor to use `catch (e: unknown)` and `e instanceof Error ? e.message : String(e)`.

3. **Inconsistent Decimal.js Casting (Memory/Rule Violation):**
   - **Location:** `src/components/shared/ActiveTechnicalsManager.svelte.ts` and UI files (e.g. `src/components/shared/JournalContent.svelte`, `TakeProfitRow.svelte`, `DepthBar.svelte`.) using `toNumber()` or native `Number()` on Decimals.
   - **Risk:** Financial precision loss for critical metrics, risking miscalculated prices or wrong inputs sent to the exchange.
   - **Resolution Needed:** Strictly enforce `Decimal` for all calculation points and avoid `toNumber()` before presentation. Note: UI presentation logic might need `toNumber()` for graphing libraries, but the underlying business logic shouldn't downcast Decimals for active trading states like in `ActiveTechnicalsManager.svelte.ts`.

4. **Resource Management (Map Reference Eviction & Subscriptions):**
   - **Location:** `src/services/bitunixWs.ts`. The `pendingSubscriptions` and `syntheticSubs` are referenced counted but might not be completely and safely reset without iterating with `.entries()` if there are logic bounds. And `tradeListeners` uses `.has()` and `.get()` but might leak if callbacks are never completely unmounted.

## 🟡 WARNING

1. **Missing i18n & Error Handling mapping:**
   - **Location:** Catch blocks in `tradeService.ts` (`throw new Error(TRADE_ERRORS.FETCH_FAILED)` etc.) do not always check if the error is a raw proxy HTML page. Some use `catch (e: unknown) { throw e; }` directly which may bubble up an unmapped error.

2. **Performance (Hot Paths):**
   - **Location:** `src/services/activeTechnicalsManager.svelte.ts` uses deep spreading (`[...marketData.klines[timeframe]]`) inside high-frequency `performCalculation`. Spreading arrays in hot paths (>10x/sec) forces excessive garbage collection.
   - **Resolution Needed:** Use array buffers or indices instead of creating new instances.

## 🔵 REFACTOR

1. **Explicit TypeScript Types over `any`:**
   - **Location:** `src/services/tradeService.ts` (`let data: any = {};` -> `let data: Record<string, unknown> = {};` using `safeJsonParse`).
   - **Justification:** "Does this measurably improve stability or performance?" Yes, stability. Ensures no random runtime failures when accessing fields.

---

# Action Plan

## Group 1: Security & Defensive Programming (CRITICAL)
- **Fix XSS Vulnerabilities:**
  - Update `src/components/settings/SettingsContent.svelte` to wrap `{@html tab.icon}` with `DOMPurify.sanitize()`.
- **Refactor Catch Blocks:**
  - Use a Bash script to search and replace `catch (e: any)` with `catch (e: unknown)` and proper type-narrowing across `src/services/activeTechnicalsManager.svelte.ts`.
- **API Error Normalization:**
  - Update `tradeService.ts` to properly catch API error payloads, detect HTML strings (e.g. proxy errors), and map them to safe `apiErrors.invalidResponse` keys.

### Unit Tests for CRITICAL logic errors:
- Add test in `tradeService_errors.test.ts` where the `fetch` is mocked to return a `502 Bad Gateway` containing `<html>...</html>`. Assert that `tradeService` throws an error with the message `apiErrors.invalidResponse` and not the raw HTML.

## Group 2: Financial Precision Hardening (CRITICAL)
- **Decimal Enforcements:**
  - Remove instances of `.toNumber()` and `Number()` casts on `Decimal` objects within `src/services/activeTechnicalsManager.svelte.ts` calculations.
  - Update any underlying state to preserve `Decimal` objects natively.

## Group 3: Memory & Resource Leaks (CRITICAL / WARNING)
- **Fix Bitunix WS Subscriptions:**
  - Ensure `tradeListeners` and `syntheticSubs` in `src/services/bitunixWs.ts` have proper teardown in `destroy()`.
  - Ensure any eviction mechanisms on Maps iterate via `.entries()` as required by system rules.

## Group 4: High-Frequency Performance Fixes (WARNING)
- **Reduce Allocation in Technicals Worker:**
  - Modify `activeTechnicalsManager.svelte.ts` to stop using `[...history]` inside the tight calculation loop if it's evaluated multiple times per second.

## Group 5: Tests & Verification
- Execute `npm run check && npm run test` to verify no regressions occur.
- **Pre-commit:** Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.

