# Codebase Analysis & Status Report

## 1. Data Integrity & Mapping

### Precision Loss with Decimals
**Finding:** Native `JSON.parse` is still used in numerous files across stores and services instead of the custom `safeJsonParse` utility.
**Impact:** 🔴 CRITICAL - Bypassing `safeJsonParse` leads to silent precision loss for large numbers (like 64-bit IDs and high-precision floats) during API serialization/deserialization or localStorage restoration.
**Locations:**
- `src/services/apiService.ts`
- `src/services/backupService.ts`
- `src/services/apiQuotaTracker.svelte.ts`
- `src/stores/ai.svelte.ts`, `src/stores/quiz.svelte.ts`, `src/stores/settings.svelte.ts`, `src/stores/indicator.svelte.ts`, `src/stores/favorites.svelte.ts`, `src/stores/notes.svelte.ts`

### Decimal.js Usage vs Floats
**Finding:** While `Decimal.js` is correctly used in core systems (`rmsService.ts`, `technicalsWorker.ts`), there are risks if numeric values are downcasted or handled natively by `JSON.parse`. `number` type is used extensively in schemas instead of forcing `Decimal` evaluation for API limits.

## 2. Resource Management & Performance

### Memory Leaks in Stores and WebSocket caching
**Finding:** `bitunixWs.ts` handles WebSocket caching. The `destroy()` method correctly calls `this.syntheticSubs.clear()` and `this.pendingSubscriptions.clear()`.
**Impact:** 🔵 REFACTOR - Memory management appears acceptable, but could be refactored for better resilience against unbounded cached Maps (e.g. `throttleMap` limits).

### Hot Paths
**Finding:** Unnecessary computations occurring frequently on the main thread rather than being offloaded or properly debounced. The use of large reactive stores without fine-grained reactivity can trigger wide-scale DOM diffing on fast price ticks.
**Impact:** 🟡 WARNING - Performance stutter on fast price streams.

## 3. UI/UX & Accessibility (A11y)

### Direct DOM Manipulation
**Finding:** Several uses of `{@html}` in Svelte components. Most critical dynamic paths are wrapped in `DOMPurify.sanitize()` or `sanitizeHtml()`, but we must ensure consistent application, especially in tooltips or newly added views.
**Impact:** 🔴 CRITICAL - Potential Cross-Site Scripting (XSS) vulnerability if untrusted input is parsed.

### Error Messages
**Finding:** The `getDisplayMessage` function in `src/utils/errorUtils.ts` directly returns `rawMessage`. If an API gateway returns an HTML error page (e.g., 502 Bad Gateway), this raw HTML might be passed to the UI and rendered in a toast.
**Impact:** 🟡 WARNING - Bad UX and potential leakage of gateway details or raw HTML.

### i18n and Broken States
**Finding:** Certain catch block fallbacks and generic error alerts fallback to literal strings instead of translation keys. The offline/500 banner UX requires graceful fallback states so the user understands the exact issue without seeing proxy HTML.
**Impact:** 🟡 WARNING - Missing i18n keys and unclear fallback states for edge cases.

## 4. Security & Validation

### Unsafe Catch Blocks
**Finding:** Extensive use of `catch (e: any)` throughout the application.
**Impact:** 🟡 WARNING - Bypasses TypeScript's strict type checking. Errors should be narrowed using `e instanceof Error ? e.message : String(e)`.

### User Input Validation
**Finding:** While inputs have some local validations, certain order APIs and parameter constructions lack strict schema checking before payload submission.
**Impact:** 🟡 WARNING - Edge case potential where UI bypasses allow malformed quantity requests.

---

# Action Plan

## Phase 1: Data Integrity & Precision Fixes (CRITICAL)
- **Action:** Replace all instances of native `JSON.parse` with the `safeJsonParse` utility across services and stores to prevent precision loss. Ensure Decimal usages are strictly maintained.
- **Suggested Test Case:**
  ```typescript
  it('should preserve 64-bit integers and precision when parsed with safeJsonParse', () => {
    const rawPayload = '{"id": 9007199254740993, "qty": "0.000000000000000001"}';
    const parsed = safeJsonParse(rawPayload);
    expect(typeof parsed.id).toBe('string');
    expect(parsed.id).toBe("9007199254740993");
    // Ensure native JSON.parse fails this exact check.
  });
  ```
- **Justification:** Guarantees institutional-grade precision for IDs and financial data. Does this measurably improve stability? Yes, prevents silent data corruption.

## Phase 2: Security & XSS Hardening (CRITICAL)
- **Action:** Audit and wrap all `{@html}` tags in `DOMPurify.sanitize()` or `sanitizeHtml()`.
- **Suggested Test Case:**
  ```typescript
  it('should sanitize script tags from injected error messages', () => {
    const dirtyError = '<script>alert(1)</script>Bad Gateway';
    const clean = DOMPurify.sanitize(dirtyError);
    expect(clean).toBe('Bad Gateway');
  });
  ```
- **Justification:** Fixes immediate XSS risks, significantly improving security posture without regressing UI function.

## Phase 3: Error Message Hardening & i18n (WARNING)
- **Action:** Update `src/utils/errorUtils.ts` to inspect `rawMessage` for HTML content (`.includes('<html')`). If present, return `$_("apiErrors.invalidResponse")` instead of raw HTML.
- **Justification:** Protects UI integrity and ensures the application displays localized text rather than raw HTML proxy errors.

## Phase 4: Type Safety Refactoring (WARNING -> REFACTOR)
- **Action:** Refactor all instances of `catch (e: any)` to `catch (e: unknown)` and properly type-narrow errors.
- **Justification:** Measurably improves code stability, eliminates unhandled errors, and adheres to strict TypeScript standards.
