# In-Depth Codebase Analysis & Hardening Report

## Step 1: Status & Risk Report

### 🔴 CRITICAL (Financial/Security Risk)
- **Data Integrity & Mapping (Precision Loss):** Native `JSON.parse` is used instead of `safeJsonParse` in multiple files (e.g., `src/components/shared/GlobalTracker.svelte`), risking silent precision loss with large numeric IDs. There are instances of native `number` being used for price/quantity instead of `Decimal.js` (e.g., `src/components/inputs/PortfolioInputs.svelte`), and downcasting of Decimal to native float via `.toNumber()` (e.g., `src/components/inputs/TradeSetupInputs.svelte`).
- **Type Safety in Catch Blocks:** Usage of `catch (e: any)` instead of `catch (e: unknown)` exists across components and services (e.g., `src/components/inputs/PortfolioInputs.svelte`), bypassing TypeScript safety.
- **Unsafe Direct DOM Manipulation:** Direct usage of DOM methods like `document.createElement` and `document.documentElement` is detected in UI components (e.g., `src/components/shared/CandlestickChart.svelte`, `src/components/shared/FXOverlay.svelte`). Usage of `document.getElementById` is detected in `src/components/shared/JournalContent.svelte`.

### 🟡 WARNING (Performance/UX/i18n Issues)
- **Resource Management (Memory Leaks):** Missing listener cleanups in `src/lib/windows/WindowManager.svelte.ts` (`window.addEventListener('mousedown', ...)`) and `src/services/activeTechnicalsManager.svelte.ts` (`document.addEventListener('visibilitychange', ...)`).
- **Performance (Hot Paths):** Complex calculations inside `requestAnimationFrame` hooks (e.g., `src/actions/burn.ts`, `src/components/shared/FXOverlay.svelte`) introduce potential framerate drops.
- **Actionable Error Messages:** Hardcoded generic string error throws in `src/services/cloudService.ts` (`throw new Error('A valid authentication token is required...')`) and `src/services/cryptoService.ts` (`throw new Error("Session locked...")`) lead to non-i18n, unhelpful UI errors.

### 🔵 REFACTOR (Stability/Maintainability Technical Debt)
- **Pervasive `any` Type:** Widespread usage of explicit `any` types throughout components and logic files (e.g., `src/components/inputs/PortfolioInputs.svelte`, `src/actions/burn.ts`), heavily compromising type safety and stability.

---

## Step 2: Action Plan (Implementation Proposal)

1. **Precision & Financial Integrity Fixes**
   - Replace native `JSON.parse` with `safeJsonParse` system-wide.
   - Refactor `price` and `quantity` fields to strictly accept `Decimal` instances. Remove `.toNumber()` downcasts.
   - *Measurable Benefit:* Prevents silent precision loss and logic bugs in order amounts and PnL calculations.
   - **Critical Unit Test Pre-Requisite:**
     - Create a test verifying `safeJsonParse` preserves IDs correctly compared to native `JSON.parse` (e.g., parsing `{"id": 1234567890123456789}`).
     - Create a test in components previously using native `number` to ensure they handle `Decimal.js` bounds and reject native numbers to avoid rounding artifacts.

2. **Type Safety & Error Handling Refactor**
   - Convert `catch (e: any)` blocks to `catch (e: unknown)`. Safely extract error messages.
   - Refactor hardcoded generic error messages into localized keys (e.g., `apiErrors.invalidResponse`).
   - *Measurable Benefit:* Ensures runtime typesafety, limits exception masking, and improves debugging in production.
   - **Critical Unit Test Pre-Requisite:**
     - Assert that non-Error throwables (e.g., string errors or numbers thrown within catch blocks) are stringified correctly using `String(e)` and do not crash the component.

3. **Resource Management & Memory Leaks Cleanup**
   - Implement strict `removeEventListener` in `activeTechnicalsManager.svelte.ts` and `WindowManager.svelte.ts`.
   - *Measurable Benefit:* Prevents progressive memory degradation over extended user sessions.

4. **DOM Manipulation & Security Hardening**
   - Replace direct `.innerHTML` and DOM manipulations with Svelte bindings. Use `markdown` action (`use:markdown`) for untrusted content.
   - *Measurable Benefit:* Eliminates XSS vectors and adheres to Svelte component lifecycle invariants.
   - **Critical Unit Test Pre-Requisite:**
     - Assert that the `markdown` action safely parses and escapes malicious strings like `<script>alert('xss')</script>`.
