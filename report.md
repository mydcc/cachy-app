# Cachy-App Status & Risk Report
## Findings

### 🔴 CRITICAL
- **Decimal.js Precision Loss**: In `src/services/activeTechnicalsManager.svelte.ts`, `price.toNumber()` is used which downcasts Decimals to floats, risking financial calculation inaccuracies.
- **Memory Leak in MarketWatcher**: The `requests` Map in `src/services/marketWatcher.ts` unsubscription logic and management needs to be verified. Bounded caches like `prunedRequestIds` also need limits.
- **Security XSS Risk in TradeService**: In `src/services/tradeService.ts`, `BitunixApiError` `rawMessage` might contain raw HTML (e.g., Cloudflare error pages) and is directly fed to error messages without sanitization.

### 🟡 WARNING
- **Indeterminate State in Optimistic Orders**: In `src/services/tradeService.ts`, if an API call times out, unconfirmed orders might be removed locally, which is dangerous if the order was executed on the exchange.
- **i18n Hardcoded Strings**: Need to verify if raw strings are used instead of `$_('key')`.

### 🔵 REFACTOR
- **Type Safety**: Some areas use `unknown` without casting to `Record<string, unknown>` safely before accessing properties (e.g., `tradeService.ts`).

## Action Plan

### 1. Decimal.js Integrity Fix (CRITICAL)
- **Target**: `src/services/activeTechnicalsManager.svelte.ts`
- **Action**: Change `priceNum = price.toNumber()` to use Decimal end-to-end if possible, or isolate the float requirement to only charting rendering while keeping internal arrays as Decimal. Note: Chart libraries often require numbers, but internal calculations must use Decimal.
- **Test cases**: Write unit test cases that assert calculation with specific inputs like `Decimal('0.1')` + `Decimal('0.2')` yields `Decimal('0.3')` rather than the `0.30000000000000004` float math behavior to demonstrate the resolution.

### 2. TradeService XSS and Type Safety Fix (CRITICAL)
- **Target**: `src/services/tradeService.ts`
- **Action**: Add HTML detection in `rawMessage` extraction. If it contains HTML (`.toLowerCase().includes('<html')`), map it to a generic localized error key like `apiErrors.invalidResponse`.
- **Action**: Update `catch` blocks handling `unknown` to safely cast to `Record<string, unknown>` before property access.
- **Test cases**: Add a unit test feeding a string payload like `"<html><body>502 Bad Gateway</body></html>"` and assert that the error falls back safely to `apiErrors.invalidResponse` without propagating raw HTML to the error handler.

### 3. MarketWatcher Memory Leak Prevention (CRITICAL)
- **Target**: `src/services/marketWatcher.ts`
- **Action**: Ensure `requests` map eviction iterates safely over entries to prevent corrupting state. Limit the size of caches like `prunedRequestIds`.
- **Test cases**: Generate thousands of pseudo request ID un-subscriptions and verify `prunedRequestIds` Map size remains under a fixed cap (e.g., `< 10000`).

### 4. TradeService Indeterminate State Fix (WARNING)
- **Target**: `src/services/tradeService.ts`
- **Action**: On network timeout for optimistic orders, do not immediately roll back the state. Keep it and mark it as `_isUnconfirmed = true` for later reconciliation.
- **Test cases**: Simulate a timeout/failure in the HTTP call after creating the optimistic order payload. Verify the local store still retains the order with `_isUnconfirmed: true`.

*All refactoring suggestions are strictly justified by measurable improvements in stability (e.g., memory safety, type safety) and financial calculation accuracy.*
