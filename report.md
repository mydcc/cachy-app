# cachy-app Status & Risk Report

## Executive Summary
This report provides an in-depth analysis of the cachy-app repository, highlighting critical vulnerabilities, potential regressions, memory leaks, and logic errors. It establishes an implementation plan for hardening the platform to institutional-grade standards.

## Findings

### 🔴 CRITICAL
- **Decimal.js Serialization Risk**: `TradeService` deep-serializes `Decimal` values to strings for API communication (`tradeService.ts:158`). However, `JSON.stringify` without a comprehensive replacer may fail to intercept deeply nested Decimals, causing them to degrade to native JS objects or floats, leading to severe precision loss.
- **WebSocket Resource Leaks**: Multiple WebSocket connections and internal API services (`omsService.ts`, `apiService.ts`, `bitunixWs.ts`, `bitgetWs.ts`) use `setInterval` for watchdog timers, telemetry, and connection monitoring. Failing to comprehensively call `clearInterval` on teardown or reconnection loops creates unbounded memory leaks and duplicate execution contexts.
- **Unvalidated API 'unknown' Access**: In `apiService.ts` and `tradeService.ts`, raw API responses frequently default to the `unknown` type in error handlers (e.g., `catch (e: unknown)`). Directly extracting properties from these payloads without type-casting or Zod validation risks uncaught TypeErrors if the API response shape changes.
- **XSS Vulnerabilities via `{@html}`**: High-risk usage of `{@html}` in Svelte components (`SummaryResults.svelte`, `SettingsContent.svelte`, `DashboardNav.svelte`, `DisclaimerModal.svelte`, `Icon.svelte`). Any dynamic injection of external API content or user inputs into these nodes without strict `DOMPurify.sanitize()` validation exposes the platform to Cross-Site Scripting (XSS).

### 🟡 WARNING
- **Memory Leaks in Caching Stores**: Reference-counted caching objects (`market.svelte.ts`) utilize intervals (`cleanupIntervalId`) for eviction. If size limits are not enforced or the iteration removes active entries improperly (e.g., evicting non-zero reference counts via naive key removal), it will corrupt application state or consume unlimited memory.
- **Missing i18n Boundaries**: Several components render localized data directly. Ensure the use of the `$_('key')` syntax is ubiquitous, particularly replacing hardcoded error strings in `tradeService.ts` to prevent broken state rendering when translations are missing.
- **Optimistic UI Deletion**: Removing unconfirmed orders aggressively during network timeouts in the Trade Service instead of flagging them for reconciliation can result in double-ordering.

### 🔵 REFACTOR
- **Consolidated Error Catching**: Refactor arbitrary string error mappings to centralized Zod schemas in `apiSchemas.ts` for strictly typed fallback mappings. This strictly improves runtime stability.

---

## Action Plan (Implementation Phase)

### 1. Fix Decimal.js Serialization (CRITICAL)
- **Action**: Implement a robust `JSON.stringify` replacer function globally within `TradeService` to strictly check `instanceof Decimal` and invoke `.toString()`. Update components utilizing floats (`activeTechnicalsManager.svelte.ts`) to maintain pure Decimal flow end-to-end.
- **Tests**: Write `tradeService_serialization.test.ts` mocking deeply nested structures with Decimal objects to verify zero precision loss.

### 2. Harden WebSocket/Interval Lifecycle (CRITICAL)
- **Action**: Refactor all classes initiating `setInterval` (`omsService.ts`, `apiService.ts`, `market.svelte.ts`) to store timer IDs and explicitly invoke `clearInterval` within `dispose()` or `teardown()` methods.
- **Tests**: Implement tests instantiating and destroying services sequentially, verifying that global intervals drop to zero.

### 3. Mitigate XSS Vectors in UI (CRITICAL)
- **Action**: Audit all instances of `{@html}`. Wrap the injected content strictly in `DOMPurify.sanitize(content)`.
- **Tests**: Inject malformed `<script>` tags into simulated `Icon.svelte` props and verify SvelteKit outputs escaped HTML.

### 4. Bounded Store Cache Eviction (WARNING)
- **Action**: Implement bounded limits for caching Maps in `market.svelte.ts`. Crucially, modify the `cleanup()` function to iterate via `.entries()` and exclusively evict items where `val === 0` (inactive), rather than blindly popping keys.

### 5. Defensive Network Error Handling (WARNING)
- **Action**: Update `apiService.ts` and `tradeService.ts` catch blocks. Convert `unknown` payload errors to `Record<string, unknown>` before property access. Map HTML proxies gracefully by searching `.toLowerCase().includes('<html')` and substituting localized fallback keys.
- **Tests**: Mock API throwing `502 Bad Gateway` containing `<html>` and assert it outputs safe i18n keys without crashing.
