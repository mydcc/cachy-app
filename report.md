# Cachy-App Status & Risk Report (Phase 1)

This report provides a detailed status and risk assessment of the cachy-app repository, focusing on data integrity, resource management, UI/UX, and security.

## 🔴 CRITICAL
- **Precision Loss in Financial Calculations:** There are multiple instances where `Decimal` types are converted to native JavaScript floats using `.toNumber()` or `Number()`. This compromises precision and violates the strict financial standards of the project.
  - Examples: `src/services/activeTechnicalsManager.svelte.ts`, `src/stores/market.svelte.ts`, `src/stores/ai.svelte.ts`, `src/components/shared/PositionsList.svelte`.
- **Unsanitized HTML Injection (XSS Risk):** Several Svelte components use the `{@html}` directive without `DOMPurify.sanitize()`, creating potential Cross-Site Scripting (XSS) vulnerabilities.
  - Examples: `src/components/results/SummaryResults.svelte`, `src/components/shared/DashboardNav.svelte`, `src/components/shared/ChartPatternsView.svelte`, `src/components/shared/OrderHistoryList.svelte`.
- **User Input Validation Gap:** Order quantities and price deviations entered by users via the UI (e.g. in TradeSetupInputs) are potentially dispatched to the API without strict pre-flight bounds checking on the client side, increasing the risk of rejected orders or accidental market impacts.

## 🟡 WARNING
- **Hardcoded Strings & i18n Verification:** The project relies on custom i18n linting rules (`scripts/lint-i18n.js`). The usage of `$t` or `$_` needs careful auditing to ensure all dynamic strings and fallbacks (like `$t('key') || 'Fallback'`) are properly typed (e.g., using `as string`) to avoid CI failures and broken UI states.
- **Interval Resource Leaks:** While most `setInterval` calls (e.g., watchdogs, polling) have corresponding `clearInterval` statements, they must be meticulously verified during component teardown (`onDestroy`) to guarantee zero memory leaks in long-running sessions.
- **Hot Paths & Re-renders:** High-frequency data paths, particularly in `MarketWatcher` and real-time stores (`market.svelte.ts`), process incoming websocket data rapidly. Unoptimized array operations or state updates in these hot paths could cause unnecessary re-renders in the UI thread.
- **Broken States & Fallbacks:** Error states (such as API 500s or network drops) lack robust fallbacks in some components. A generic "An error occurred" or blank UI state during connectivity loss leaves the user without actionable next steps.

## 🔵 REFACTOR
- **Type Safety in Interfaces:** Ensure that all data models strictly validate API responses (especially REST and WebSockets) before mapping them to internal stores, removing reliance on `any`.

---

## Action Plan (Phase 2 - Implementation)

### 1. Fix Precision Loss (🔴 CRITICAL)
- Review all usages of `Number()` and `.toNumber()` in the codebase (identified via `grep`).
- Replace these with strict `Decimal.js` operations (e.g., `.plus()`, `.minus()`, `.div()`, `.times()`) across services and stores to maintain end-to-end precision.
- **Unit Test Requirement:** Provide concrete unit tests demonstrating the prevention of floating-point inaccuracies before implementing the fix (e.g. `test('preserves precision for 19-digit integers', () => ...)`).

### 2. Hardening Security: Sanitize HTML (🔴 CRITICAL)
- Wrap all vulnerable `{@html ...}` directives in Svelte components with `DOMPurify.sanitize(...)`.
- Ensure `dompurify` is imported in every affected file.
- **Unit Test Requirement:** Provide tests attempting to render a script tag and assert it is stripped.

### 3. Implement Strict Input Validation (🔴 CRITICAL)
- Ensure all numeric inputs (order quantities, prices) are strictly validated against minimum/maximum symbol constraints before being passed to `TradeService`.
- **Unit Test Requirement:** Test with out-of-bounds size inputs to ensure they are blocked client-side.

### 4. I18n and Error Handling Improvements (🟡 WARNING)
- Audit the codebase for hardcoded English strings in UI components.
- Replace them with proper `$_('key')` syntax and assert types `as string` where fallbacks are used.
- Address **Broken States** by ensuring actionable error boundaries (e.g., "Connection lost. Retrying in 5s...").

### 5. Fix Memory Leaks & Optimize Hot Paths (🟡 WARNING)
- Verify that every `setInterval` created in services (e.g., `bitunixWs.ts`, `market.svelte.ts`) is correctly scoped and explicitly cleared in the respective disposal or teardown methods.
- Optimize the state mutations inside `market.svelte.ts` to ensure updates occur efficiently without causing full re-renders for every tick.

### 6. Refactoring Data Models (🔵 REFACTOR)
- Update data parsing logic to use safe parsers (avoiding `any`).
- **Justification:** This refactoring measurably improves stability by preventing unexpected data structures from crashing the application or polluting the global state.

### 7. Execute Tests & Pre-commit
- Run `npm install && npm run check && npm run test` to verify no regressions were introduced.
- Simulate a production build (`NODE_ENV=production npm run build`).
