# In-Depth Status & Risk Report (Read-Only Phase)

Based on a thorough scan of the codebase for the `cachy-app` professional crypto trading platform, the following findings have been identified. The analysis focuses on data integrity, mapping, resource management, performance, UI/UX (A11y), and security & validation.

## 🔴 CRITICAL

*   **Security & Validation (Direct DOM Manipulation):**
    *   In `src/actions/markdown.ts`, line 30 uses `node.innerHTML = renderSafeMarkdown(newContent);`. This is an unsafe direct DOM manipulation. It should use `DocumentFragment` with `replaceChildren()` to mitigate XSS/mXSS risks when handling localized text or database content.
*   **Data Integrity & Mapping (API Responses & Float Inaccuracies):**
    *   In `src/services/apiService.ts` and `src/services/bitunixWs.ts`, while `Decimal.js` is widely used for price/quantity (e.g. `const open = new Decimal(d[1]);`), there are instances of numerical processing directly via `typeof data.lastPrice === 'number'` that may introduce floating-point inaccuracies, specifically noted with `[BitunixWS] PRECISION RISK`.
    *   Some `NaN` casting is aggressively caught, but not uniformly across all services. The use of string extraction for `Decimal` must be completely strictly enforced to adhere to financial standards.
*   **Resource Management & Performance (Memory Leaks):**
    *   In `src/services/marketWatcher.ts`, `exhaustedHistory`, `historyLocks`, and `prunedRequestIds` sets/maps manage state. While bounds (e.g. `clear()`) were added (e.g. `if (this.exhaustedHistory.size > 1000)`), unconditional `.clear()` should be avoided to prevent losing active state. It requires bounded eviction strategies.
    *   `src/stores/market.svelte.ts` uses caching arrays that could lead to bounded but significant memory pressure during websocket "hot paths".

## 🟡 WARNING

*   **UI/UX & Accessibility (Missing i18n & Actionable Error Messages):**
    *   Hardcoded error strings that bypass the `locales` translation keys exist. Examples include:
        *   `src/services/tradeService.ts:329` uses `toastService.error(\`Flash Close Failed: ${msg}\`);` instead of an i18n key.
        *   `src/services/marketAnalyst.ts:250` uses `toastService.error(\`Analysis failed for ${symbol}: ${errorMsg}\`);`.
        *   Raw system-level error messages (`msg`) are directly exposed to the user UI, which are often unhelpful and lack actionable context.
*   **Resource Management & Performance (Hot Paths & Iterations):**
    *   Multiple files (`discordService.ts`, `syncService.ts`, `tradeService.ts`) use the `.map(async () => ...)` pattern. This causes unnecessary closure allocations inside performance-critical areas and async context overhead. These should map directly to promises and process results synchronously.

## 🔵 REFACTOR

*   **Code Smell (Timer Management):**
    *   Singletons and stores like `MarketWatcher` heavily rely on `setInterval` and `setTimeout`. Refactoring these into robust retry policies or strictly managed lifecycle timers with explicit teardowns in `destroy()` across the board would improve stability and prevent "zombie" request leaks.
