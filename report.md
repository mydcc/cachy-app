# In-Depth Analysis & Status Report

## 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1. **Unbounded Throttle Map Memory Leak in `bitunixWs.ts`**
   - **Location:** `src/services/bitunixWs.ts` -> `pruneThrottleMap()` is implemented but NEVER CALLED in `handleOnline`, `handleOffline`, or normal operation flow. Although there is a check `this.throttleMap.size > 1000` that clears the map, blindly calling `clear()` completely disrupts active throttling state for all keys simultaneously instead of expiring old keys.
   - **Impact:** Can cause massive memory bloat during high volatility and erratic throttling behavior when the 1000 limit is hit, potentially dropping critical market updates.
   - **Remediation:** Remove the hard `clear()` condition and rely on `pruneThrottleMap()` on an interval, or use LRU/TTL logic correctly.

2. **Unsafe HTML Exposure via Error Mapping (`tradeService.ts`)**
   - **Location:** `src/services/tradeService.ts` error messages from `e.rawMessage` are surfaced directly to the UI without checking for HTML content (e.g. 502 Proxy Error pages).
   - **Impact:** XSS vulnerability / poor UX if standard proxies return HTML error pages that Svelte toast renders.
   - **Remediation:** Check `e.rawMessage.toLowerCase().includes('<html')` and map to a localized key like `apiErrors.invalidResponse`.

3. **Loss of Precision parsing JSON from Storage (`apiQuotaTracker.svelte.ts` / `backupService.ts`)**
   - **Location:** Using native `JSON.parse()` in multiple places instead of `safeJsonParse`.
   - **Impact:** 64-bit float precision loss on large numerical IDs or crypto amounts when reading from localStorage or processing backups.
   - **Remediation:** Replace `JSON.parse` with `safeJsonParse` everywhere.

4. **Incomplete Error Handling in `newsService.ts`**
   - **Location:** Multiple generic `catch (e: any)` blocks without proper typing.
   - **Impact:** Bypasses TypeScript and fails silently.
   - **Remediation:** Use `unknown` and strict type checking.

## 🟡 WARNING (Performance issue, UX error, missing i18n)

1. **Unsafe Response Text Parsing (`apiService.ts` & `tradeService.ts`)**
   - **Location:** `const text = await response.text();` in both services is NOT wrapped in a try/catch.
   - **Impact:** Network interruptions mid-stream will crash the worker/thread with an unhandled rejection.
   - **Remediation:** Wrap in `try { ... } catch { throw new Error('apiErrors.invalidResponseFormat') }`.

2. **Missing i18n for API Errors**
   - **Location:** Hardcoded errors or raw error strings passed from `rawMessage` in `tradeService.ts`.
   - **Impact:** User sees unlocalized text on errors.
   - **Remediation:** Route through `i18n` translation pipeline securely.

## 🔵 REFACTOR (Code smell, technical debt)

1. **Avoid `any` Types (`tradeService.ts` & `newsService.ts`)**
   - **Location:** Occurrences of `data: any` when parsing JSON payloads.
   - **Impact:** Reduces strictness.
   - **Remediation:** Use `unknown` or `Record<string, unknown>` and safe Zod validation schemas (`TpSlOrderSchema`).


## Step 2: Action Plan

### Group 1: Memory & Stability Hardening (CRITICAL)
1. **Fix `bitunixWs.ts` Throttler:**
   - Remove the unsafe `this.throttleMap.clear()` inside `checkThrottle()`.
   - Instead of clearing unconditionally, iterate over `.entries()` and safely delete entries where `now - timestamp > this.THROTTLE_TTL` when the size hits a certain limit to cap memory without destroying active state.
   - *Unit Test:* Will use a targeted test for `bitunixWs.ts` throttling logic to ensure active throttles are preserved during cleanup.

### Group 2: JSON Parsing Precision & Safety (CRITICAL)
1. **Replace `JSON.parse` with `safeJsonParse`:**
   - In `src/services/backupService.ts`, replace `JSON.parse` with `safeJsonParse` and ensure correct imports.
   - In `src/services/apiQuotaTracker.svelte.ts`, replace `JSON.parse` with `safeJsonParse` and ensure correct imports.

### Group 3: Error Handling & XSS Prevention (WARNING -> CRITICAL)
1. **Sanitize `rawMessage` in `tradeService.ts`:**
   - In the `catch` blocks where `rawMessage` is used (lines ~297, ~535), check if `e.rawMessage` contains `<html` (case insensitive). If it does, strictly map the error message to the localized key `apiErrors.invalidResponse`.
2. **Safe Stream Reading in `apiService.ts` and `tradeService.ts`:**
   - Wrap `await response.text()` calls in `try/catch` blocks.
   - Throw `new Error("apiErrors.invalidResponseFormat")` on failure.

### Group 4: TypeScript Strictness & Cleanups (REFACTOR)
1. **Fix `catch (e: any)` in `newsService.ts`:**
   - Change `catch (e: any)` to `catch (e: unknown)`.
   - Update error extraction to `e instanceof Error ? e.message : String(e)`.
2. **Eliminate `any` Data Casting:**
   - In `tradeService.ts`, change variables like `let data: any = {};` to `let data: Record<string, unknown> = {};` and update subsequent assignments accordingly, casting via `safeJsonParse` output.

### Group 5: Finalization
1. Use `run_in_bash_session` to execute the necessary tests to verify fixes.
2. Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
