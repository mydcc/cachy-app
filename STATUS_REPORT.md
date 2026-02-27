# Status & Risk Report

## 🔴 CRITICAL
*   **Precision Loss Risk:** `src/services/mappers.ts` detected potential precision loss for `orderId` > `Number.MAX_SAFE_INTEGER`. While `safeJsonParse` handles this upstream, the internal application logic still casts some IDs to numbers in legacy paths.
    *   *Action Taken:* Updated `mapToOMSOrder` to log a critical error if a numeric ID exceeds safe limits.
*   **Numeric Type Safety:** Inconsistent usage of `Decimal`, `number`, and `string` across services (`MarketWatcher`, `TradeService`).
    *   *Action Taken:* Audited and confirmed `MarketWatcher.fillGaps` and `applySymbolKlines` now strictly enforce `Decimal` or safe primitives.

## 🟡 WARNING
*   **Missing i18n Keys:** Several hardcoded strings were found in UI components (e.g., `TradeSetupInputs.svelte` placeholders) that are not fully covered by `en.json` / `de.json`.
*   **CSP Configuration:** `unsafe-inline` is allowed for styles, and `wasm-unsafe-eval` for scripts. This is often necessary for Svelte/Wasm but represents a reduced security posture.
*   **Zombie Subscriptions:** While `BitunixWebSocketService` has cleanup logic, the `pruneZombieRequests` in `MarketWatcher` relies on timeouts which might be aggressive under heavy load.

## 🔵 REFACTOR
*   **Code Duplication:** Validation logic for numeric inputs is repeated across `TradeSetupInputs.svelte` and `PortfolioInputs.svelte`. Consolidating into a reusable action or utility is recommended.
*   **Magic Numbers:** `MarketWatcher` uses hardcoded limits (e.g., `MAX_GAP_FILL = 5000`). These should be moved to a configuration constant.

## ✅ Hardening Actions Completed
*   **Data Integrity:** Enforced `Decimal` usage in critical paths.
*   **Resource Management:** Verified bounded buffers (`KLINE_BUFFER_HARD_LIMIT`) and strict WebSocket cleanup.
*   **Security:** Confirmed API key redaction in logs and encryption at rest in `settingsState`.
