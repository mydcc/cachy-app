# cachy-app Code Analysis & Hardening Report

## 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1. **Floating Point Inaccuracies (Data Integrity)**:
    - Found instances of `.toNumber()` being used on `Decimal` objects in `src/services/activeTechnicalsManager.svelte.ts` (lines 654, 666). This is a critical violation of financial standards, as it downcasts high-precision Decimals back to native JavaScript floats, which can cause precision loss in trading calculations.

2. **Precision Loss via Native `JSON.parse`**:
    - Discovered numerous usages of `JSON.parse` across the codebase (e.g., `src/services/backupService.ts`, `src/services/apiService.ts`, stores). The memory guidelines explicitly state to strictly use the custom `safeJsonParse` utility rather than native `JSON.parse` to prevent silent precision loss with large numeric IDs.

3. **Potential XSS via `{@html}`**:
    - Found several uses of `{@html}` in Svelte components (`src/routes/+page.svelte`, `src/routes/+layout.svelte`). Although most seem to be rendering SVGs (icons), any dynamic usage that is not wrapped in `DOMPurify.sanitize()` represents a potential Cross-Site Scripting (XSS) vulnerability.

## 🟡 WARNING (Performance issue, UX error, missing i18n)

1. **Missing i18n / Hardcoded Strings**:
    - Raw API error messages or HTML responses should not be exposed to the UI (e.g. `toastService`). We must map raw errors (especially those potentially containing HTML) to localized i18n keys before passing them to the UI/Toast service.

2. **Unsafe Catch Blocks**:
    - Some catch blocks might use `catch (e: any)`. These should be type-narrowed using `e instanceof Error ? e.message : String(e)`.

## 🔵 REFACTOR (Code smell, technical debt)

1. **WebSocket & Store Memory Management**:
    - To measurably improve stability and prevent memory leaks, we should verify if caching structures (e.g. `Map` and `Set`) have bounded eviction strategies or proper cleanup (`destroy()`) that calls `.clear()`.


# Action Plan

### 1. Fix Decimal Serialization & Precision Loss (CRITICAL)
- **Specific Test Case**: Write a unit test providing a large 19-digit integer or high-precision Decimal to `activeTechnicalsManager` and verifying that the original precision is retained. Assert that native `JSON.parse` is not used.
- **Fix**: Replace `.toNumber()` calls on Decimals in `activeTechnicalsManager.svelte.ts` with proper Decimal arithmetic or update the corresponding logic to accept `Decimal` directly. Replace unsafe `JSON.parse` usages with the custom `safeJsonParse` across the codebase.

### 2. Secure `{@html}` Renders (CRITICAL)
- **Specific Test Case**: Write a unit test providing a malicious script tag (e.g., `<script>alert('xss')</script>`) to any dynamic `{@html}` inputs and verify it is stripped before rendering.
- **Fix**: Ensure all `{@html}` tags in `.svelte` files are either rendering static, safe strings or are wrapped with `DOMPurify.sanitize()` to prevent XSS.

### 3. Hardening Error Messages & i18n (WARNING)
- **Fix**: Audit error handling in API and WebSocket services to map raw errors (especially those containing HTML) to generic localized error keys (e.g., `apiErrors.invalidResponse`). Avoid leaking sensitive gateway details to `toastService`.

### 4. WebSocket & Memory Management Refactoring (REFACTOR)
- **Justification**: Does this measurably improve stability or performance? Yes, preventing unbounded memory growth in caching Maps/Sets and properly closing WebSocket subscriptions prevents memory leaks and eventual crashes.
- **Fix**: Implement bounded eviction strategies for caching Maps/Sets. Ensure complete teardown methods (e.g., `destroy()`) unconditionally call `.clear()` on internal collections.
