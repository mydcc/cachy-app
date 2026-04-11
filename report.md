
# System Analysis Report

## 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)
- `src/services/tradeService.ts`: The method `cancelTpSlOrder(order: any)` is lacking type safety for the `order` parameter, missing crucial field guarantees like `orderId` or `symbol`, which may result in critical logic bugs. It should strictly use the `TpSlOrder` interface.
- Native float conversions (e.g. `parseFloat`, `Number()`) are widely used for prices and quantities across the app (e.g., `src/services/csvService.ts`, `src/components/settings/tabs/VisualsTab.svelte`, `src/components/shared/MarketOverview.svelte`, etc.). For financial safety, all conversions must route via `new Decimal(val).toNumber()` if primitives are strictly needed for performance, or use Decimal instances outright to avoid floating-point inaccuracies. (Note: Only specific logic flows, not the entire app, will be fixed in this run for feasibility).

## 🟡 WARNING (Performance issue, UX error, missing i18n)
- Resource Management & Performance: Re-evaluating WebSocket classes (`bitunixWs.ts`, `bitgetWs.ts`) for missing teardown logic that causes unclosed subscriptions, leading to memory leaks. Bounded eviction strategies should be used for caches.
- Thundering Herd Problem: The `fetchTpSlOrders` method in `TradeService` lacks request deduplication, which may cause simultaneous fetch calls to bypass caches and overwhelm the API or rate limiters.

## 🔵 REFACTOR (Code smell, technical debt)
- `src/services/tradeService.ts`: Error messages currently use hardcoded string keys (e.g., `throw new Error("apiErrors.missingCredentials")`). These should be replaced by predefined centralized error constants mappings (e.g., `throw new Error(TRADE_ERRORS.MISSING_CREDENTIALS)`) to ensure consistency and facilitate translation coverage checks.
