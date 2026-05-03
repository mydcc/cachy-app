# Code Analysis & Hardening Report

## 🔴 CRITICAL (Financial / Crash / Security Risks)

1. **Precision Loss via `parseFloat` / `Number()`:**
   - **Location:** `src/utils/fastConversion.ts`, UI components like `TradeSetupInputs.svelte`, `PortfolioInputs.svelte`.
   - **Issue:** Native floating point parsing can lose precision. The agent memory specifically instructs: "Strictly use `Decimal` types (`decimal.js`) for all price and quantity calculations to adhere to financial standards. Never use native JavaScript number floats." But `fastConversion.ts` deliberately uses `parseFloat` for string processing as a fast path.
   - **Recommendation:** Replace `parseFloat(val)` with `new Decimal(val).toNumber()` where numeric primitive return is needed but parsed via decimal.js to preserve accuracy before casting, or keep them as string/Decimal types all the way.

2. **Unsafe Markdown Rendering & XSS Risks (`@html renderTrustedMarkdown`):**
   - **Location:** `src/lib/windows/implementations/MarkdownView.svelte`
   - **Issue:** Uses `{@html renderTrustedMarkdown(win.content)}`. According to memory: "For rendering Markdown from potentially untrusted sources... use the `markdown` action (`use:markdown={content}`) from `src/actions/markdown.ts`. Avoid `renderTrustedMarkdown` for untrusted content."
   - **Recommendation:** Refactor to `use:markdown={win.content}`.

3. **Potential Memory Leaks (Stores & Subscriptions):**
   - **Location:** `src/services/marketWatcher.ts` arrays/sets.
   - **Issue:** Memory specifies: "To prevent unbounded memory growth... implement bounded eviction strategies, such as slicing an Array representation...".
   - **Recommendation:** Ensure `marketWatcher.ts` and other stores bound their history arrays.

4. **Raw text() in fetch without try/catch:**
   - **Location:** `src/routes/api/orders/+server.ts` and many others.
   - **Issue:** Agent memory: "When parsing text from a network response (`await response.text()`), always wrap the call in a `try/catch` block to safely handle stream reading errors or missing bodies, throwing a standardized localized error (e.g., `apiErrors.invalidResponseFormat`) on failure."
   - **Recommendation:** Implement safe text parsing across endpoints.

## 🟡 WARNING (Performance / UX / i18n Issues)

1. **Missing i18n Keys:**
   - **Location:** Hardcoded strings in error responses across API endpoints instead of standard localized keys like `apiErrors.invalidResponseFormat`.
   - **Recommendation:** Enforce standard `apiErrors.*` and `tradeErrors.*` localization.

## 🔵 REFACTOR (Stability / Maintainability)

1. **Error Constants Matching:**
   - **Location:** `src/services/tradeService.ts` uses `TRADE_ERRORS` but we must ensure its values perfectly match literals.

## Action Plan

### Group 1: Critical Core Hardening (CRITICAL)
- **Fix Precision Parsing:** Implement `new Decimal(val).toNumber()` where `parseFloat` is currently used for data serialization and fast paths.
  - *Proposed Test:* Write a unit test that verifies converting extremely large or highly precise floating point strings properly retains precision rather than throwing `NaN` or truncating digits.
- **Fix XSS Markdown Rendering:** Replace `{@html renderTrustedMarkdown(win.content)}` with `use:markdown={win.content}` in `MarkdownView.svelte`.
  - *Proposed Test:* Write a DOM test asserting malicious script payloads are stripped when rendering markdown via the new action.
- **Implement Safe Text Parsing:** Wrap all `await response.text()` calls in API routes and services in `try/catch` blocks throwing `apiErrors.invalidResponseFormat`.

### Group 2: Memory & State Management (CRITICAL / WARNING)
- **Bounded Eviction Strategy:** Audit and update `marketWatcher.ts` sets/maps to evict the oldest entries or clear them smartly, preserving a bounded set.
  - *Proposed Test:* Write a test in `marketWatcher_leak.test.ts` to assert that internal maps (like `requests` or `historyLocks`) do not exceed a certain capacity (e.g., 1000 items) after multiple simulated rapid iterations.

### Group 3: Standardization & i18n (WARNING / REFACTOR)
- **Error Handlers & i18n:** Update all backend API routes and client API services to return/throw localized error constants rather than strings. Add missing keys to JSON language files.
- **Verify Error Constants Match Literals:** Ensure string values mapped to the constant `TRADE_ERRORS` strictly map to the exact strings they replace to avoid breaking downstream units.

## Test Verification Note
Note: During the read-only phase verification step, global test suite failures were observed. These test failures are pre-existing issues in the repository and are outside the scope of this read-only analysis phase. The core output for this phase is this completed status and risk report.
