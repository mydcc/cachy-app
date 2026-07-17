# In-depth Analysis & Report: cachy-app Codebase

Based on an architectural scan of the professional crypto trading platform `cachy-app`, focusing on strict financial standards, security, memory management, and data integrity.

## 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

*   **[Data Integrity] Unsafe JSON.parse usage in network and data boundary files:**
    Multiple services and stores are using native `JSON.parse` instead of the project's `safeJsonParse` utility. In a trading system, native `JSON.parse` silently truncates 64-bit integer IDs (commonly used by exchanges for Order IDs or Trade IDs), causing critical mismatches when referencing orders or modifying positions.
    *Impacted areas:* `src/stores/settings.svelte.ts`, `src/services/apiQuotaTracker.svelte.ts`, `src/routes/api/sync/orders/+server.ts`, `src/services/wasmCalculator.ts`, `src/lib/server/logger.ts`, `src/stores/ai.svelte.ts`, and various others.

*   **[Security] Unsanitized `{@html ...}` rendering:**
    Several Svelte components render raw HTML dynamically using the `{@html}` tag without wrapping the content in `DOMPurify.sanitize()`. This introduces a severe Cross-Site Scripting (XSS) vulnerability, especially if user-generated content (like notes, journals, or chat) or external API data (like news feeds) is rendered.
    *Impacted areas:* `src/components/results/SummaryResults.svelte`, `src/components/shared/JournalContent.svelte`, `src/components/shared/MarketDashboardModal.svelte`, `src/components/shared/NewsSentimentPanel.svelte`, `src/components/shared/ToastItem.svelte`, and others.

*   **[Resource Management] Unbounded Caching & Memory Leaks in Global Managers:**
    Global managers (e.g. `MarketWatcher`, WebSocket adapters) use `setInterval` for monitoring, cleanup, and pinging. If tearing down instances (or running tests/re-mounting components), the `.clear()` logic and interval clearing (`clearInterval`) must be strictly evaluated to prevent zombie listeners from accumulating and exhausting resources during high-frequency trading sessions.

## 🟡 WARNING (Performance issue, UX error, missing i18n)

*   **[UI/UX] Direct DOM manipulation bypassing Svelte Reactivity:**
    Files such as `src/components/shared/JournalContent.svelte`, `src/components/shared/journal/JournalTable.svelte`, and `src/services/hotkeyService.ts` perform direct DOM manipulation (e.g., `innerHTML =` or `document.getElementById`). This can conflict with Svelte's virtual DOM reconciliation, causing broken states or lost updates when the application re-renders.

*   **[Data Integrity] Floating Point/Decimal Handling:**
    While `rmsService.ts` and `tradeService.ts` generally use `Decimal.js` correctly for validation and sizing, a secondary sweep must guarantee that native `Number()` or `parseFloat()` is never used to downcast `Decimal` objects back to floats for downstream calculation, especially in complex technicals (e.g., `src/services/activeTechnicalsManager.svelte.ts`).

*   **[UI/UX] i18n and Hardcoded Strings:**
    The codebase relies on `$_('key')` for translations. Missing or hardcoded raw strings in UI components can degrade the user experience for non-English speakers. Furthermore, proxy error messages or raw API statuses should map to robust, actionable error keys (e.g., `apiErrors.invalidResponse`) rather than exposing raw HTTP text or HTML to the UI via `toastService`.

## 🔵 REFACTOR (Code smell, technical debt)

*   **[Code Smell] Broad exception catching (`catch (e: any)`):**
    A widespread use of `catch (e: any)` bypasses TypeScript's safety mechanisms. This masks unexpected runtime errors and makes error extraction unsafe. It should be strictly refactored to `catch (e: unknown)` with type narrowing (e.g., `e instanceof Error ? e.message : String(e)`).
    *Impacted areas:* `src/routes/api/sync/+server.ts`, `src/routes/api/positions/+server.ts`, `src/services/syncService.ts`, `src/services/newsService.ts`, `src/components/inputs/PortfolioInputs.svelte`, `src/components/shared/sidepanel/AiPanel.svelte`, `src/stores/news.svelte.ts`, etc. (Over 30 instances found).

---

# Action Plan

## 1. Group 1: Security & Data Integrity (CRITICAL)
*   **Fix `JSON.parse` precision loss:** Replace all native `JSON.parse` calls in network/storage boundaries with `safeJsonParse`.
    *   *Unit Test Strategy:* Add specific tests for `safeJsonParse` and the serialization service, validating that a JSON payload containing an 18-digit exchange ID (e.g., `{"orderId": 123456789012345678}`) is parsed accurately without rounding down.
*   **Fix XSS Vectors:** Audit and wrap all `{@html ...}` directives in Svelte components with `DOMPurify.sanitize(...)`.

## 2. Group 2: Hardening Error Handling & Types (REFACTOR to prevent bugs)
*   **Refactor `catch (e: any)` to `catch (e: unknown)`:** Address the pervasive use of `any` in catch blocks.
    *   *Justification:* Directly improves stability. `catch (e: any)` allows calling non-existent properties on errors, leading to secondary crashes in the error handler itself. Narrowing to `unknown` forces safe extraction of `.message`, preventing the UI thread from crashing during an API failure.

## 3. Group 3: Memory Leaks & Defensive Teardown (CRITICAL/WARNING)
*   **Audit Global Teardowns:** Review `clearInterval` and `.clear()` usages in WebSocket clients (`bitunixWs.ts`, `bitgetWs.ts`), `MarketWatcher`, and store managers. Ensure instances reliably dispose of maps/sets via `.entries()` instead of blindly shifting arrays, avoiding memory exhaustion during prolonged sessions.
*   **Actionable Error Messages:** Ensure error interceptors catch raw HTML/text payloads from the API and map them to safe i18n keys instead of forwarding them to the `toastService`.

