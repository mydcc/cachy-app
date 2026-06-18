# Cachy-App Status & Risk Report

## 🔴 CRITICAL

### Data Integrity & Mapping
- **Type Safety in Services:** `dataRepairService.ts` uses `catch (e: any)` instead of `catch (e: unknown)`, allowing potential type safety issues when parsing errors. `tradeService.ts` and `apiService.ts` have instances where `any` is used for generic API responses instead of `Record<string, unknown>`.
- **Error Handling (HTML Leaks):** In `tradeService.ts`, when handling non-JSON responses from APIs (e.g., 502 Bad Gateway), the fallback logic maps exceptions without explicitly checking if the raw message contains HTML, risking exposure of proxy pages to the UI if `rawMessage` is directly displayed via `toastService`.

### Security & Validation
- **Potential XSS via \`@html\`:** While most components use `DOMPurify.sanitize` (e.g., `Icon.svelte`, `CalculationDashboard.svelte`), some instances of `{@html}` exist without sanitization checks. While many are safe icon injections, we must strictly ensure no user-provided content or translations touch `{@html}` directly.

---

## 🟡 WARNING

### Resource Management & Performance
- **Memory Leaks in Caches (Unbounded Maps):** `apiService.ts` (`cache`, `rateLimiters`), `workerPool.ts` (`pendingTasks`), and `webGpuCalculator.ts` (`pipelines`, `frameBufferCache`) utilize unbounded Maps and Sets without size constraints. This will lead to unbounded memory growth over prolonged trading sessions.
- **Floating Point Inaccuracy:** Throughout the UI components (`MarketOverview.svelte`, `PositionsList.svelte`, `VisualBar.svelte`), strict `Decimal` objects are being converted to floats via `.toNumber()`. This undermines the precision required for institutional-grade financial apps and risks precision loss during UI recalculations.

### UI/UX & Accessibility (A11y)
- **Unclear Error Messages:** Network timeouts and JSON parsing failures currently throw generic errors. They should be mapped to actionable, translated error keys (e.g., `apiErrors.invalidResponseFormat`).
- **Hardcoded Strings / Missing i18n:** There are missing `$t()` / `$_()` wrappers around generic text strings. `toastService.error` calls are partially translated but use hardcoded fallback text.

---

## 🔵 REFACTOR

- **Refactor Native Numbers to Decimal:** Complete the migration away from native Javascript numbers for all price, quantity, margin, and PnL calculations. End-to-end Decimal flow is required to avoid `new Decimal()` allocations and float-rounding regressions.

---

# Action Plan

## 1. Hardening Data Integrity & Error Handling (CRITICAL)
- **Fix `catch (e: any)` instances:** Refactor `dataRepairService.ts` and others to use `catch (e: unknown)` and narrow the type using `e instanceof Error ? e.message : String(e)`.
- **Sanitize API Error Outputs:** Update `BitunixApiError` mapping in `tradeService.ts` and `apiService.ts` to detect HTML in `rawMessage` (e.g., `.toLowerCase().includes('<html')`) and map it to `apiErrors.invalidResponse`.
- *Test Case Justification:* Create unit tests simulating a 502 Bad Gateway with an HTML response payload. Ensure the error parser correctly throws a generic localized error key without exposing HTML.
- *Why:* Prevents raw gateway errors and HTML from breaking the UI layout and ensures type safety.

## 2. Hardening Resource Management (WARNING)
- **Implement Bounded Eviction on Maps:** Refactor `cache`, `rateLimiters`, `pendingTasks`, and WebSocket `syntheticSubs`/`pendingSubscriptions` to use size limits (e.g., `if (cache.size > 1000) evict()`). For reference-counted Maps, safely evict inactive entries via `.entries()` instead of `.keys().next()`.
- **Ensure Deterministic Release:** Ensure `clear()` is explicitly called on Maps/Sets in all `destroy()` methods.
- *Why:* Fixes memory leaks in long-running tabs, maintaining app performance and stability.

## 3. Decimal End-to-End Migration (WARNING & REFACTOR)
- **Remove `.toNumber()` Downcasting:** Refactor Svelte components (`MarketOverview`, `PositionsList`, `VisualBar`) to accept `Decimal` directly instead of calling `.toNumber()`.
- *Why:* Prevents floating-point precision loss in financial data processing, improving accuracy for pro-traders.

## 4. Execute Tests & Pre-commit
- **Execute Tests:** Run specific unit tests targeting the modified services (e.g., `bitunixWs.leak.test.ts`, `dataRepairService.test.ts`).
- **Complete Pre-Commit Steps:** Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
