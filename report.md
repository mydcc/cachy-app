# In-depth Status & Risk Report (Phase 1)

## 🔴 CRITICAL (Financial loss, crash, security)
1. **Unsafe use of `Number()` and `parseFloat()` instead of `Decimal`:**
   - `src/services/mdaService.ts` lines 102, 120 (`Number(...)` on API timestamp responses without precision guard)
   - `src/services/mappers.ts` line 114
   - `src/services/csvService.ts` line 353
   *Risk:* Precision loss in timestamp/price conversions which can lead to faulty order executions or calculations.

2. **Uncaught exceptions breaking critical UI/Service states (Hardening):**
   - `TradeService.ts` (line 209): Throws bare `Error(TRADE_ERRORS.FETCH_FAILED)` in `ensurePositionFreshness`. If called by polling or unhandled UI paths, it may cause silent data drops or crash the local execution context.
   - `TradeService.ts` (line 418): `fetchOpenPositionsFromApi` throws exceptions out instead of handling gracefully, which could disrupt the entire `MarketWatcher` state loop if not caught downstream.

3. **Memory Leaks via Missing Cleanup:**
   - `PerformanceMonitor.ts`: Doesn't implement a `destroy()` method, only `stop()`. Missing cleanup for `setInterval`.
   - UI Timers: Several components like `EngineDebugPanel`, `CalculationDashboard`, and `MarketOverview` rely heavily on implicit destruction logic for `setInterval`. (Needs tight verification via specific unit tests or explicit clear logic).
   - *Note: `MarketWatcher` handles memory clears in `destroy()` properly.*

## 🟡 WARNING (Performance, UX, i18n)
1. **Missing i18n / Hardcoded Strings:**
   - `TradeService`: `throw new Error("NO_API_KEY")` (line 480, 492) - Unlocalized string string in an error pipeline.
   - `NewsService`: "Unknown" source string hardcoded (line 272, 329).
   - General: Console logs and warnings that could potentially be exposed to UI lack localization, though they are currently wrapped under `logger`.

2. **Performance (Hot Paths):**
   - `BitunixWs` processes millions of messages. It currently maps high-volume data dynamically and allocates objects.
   - `TradeService`: Serializes large payloads recursively up to depth 20 (`serializePayload`), which is synchronous and can block the UI thread during large order submissions or syncs.

3. **Inconsistent Types (`any` and `unknown`):**
   - `TradeService.ts`: `[key: string]: unknown` on `TpSlOrder` but `any` used in `TradeError` details (line 79).
   - `NewsService`: `catch (e: any)` everywhere (line 283, 340, 508). Map items blindly cast with `(item: any)` (line 269, 326).

## 🔵 REFACTOR (Stability, Maintainability)
1. **Cleanup of duplicate timer management:** Replace ad-hoc `setInterval` and `setTimeout` tracking across services with a central `TimerManager` or strictly enforce `destroy()` protocols across all stores and singletons.
2. **Replace `(e: any)` with `unknown`:** Ensure `String(e)` or safe type guards are used uniformly in catch blocks.

# Action Plan (Phase 2)

### Group 1: Number Conversions and Type Safety (`CRITICAL`)
**Justification:** Measurably improves stability by ensuring numeric and timestamp integrity without risking floating-point errors.
*   **Action**: In `mdaService.ts` and `csvService.ts`, replace `Number()` and `parseFloat()` wrappers with `new Decimal(...).toNumber()` where strings represent large numbers.
*   **Action**: Replace `catch (e: any)` with `catch (e: unknown)` in `NewsService` and `TradeService`.
*   **Unit Test to Reproduce (Before Fix)**: Create a mock test in `mdaService.test.ts` where a massive timestamp string is given (e.g. `1234567890123456789`) and assert `Number()` loses precision compared to `Decimal`.

### Group 2: Hardening Service errors & Leaks (`CRITICAL`)
**Justification:** Measurably improves stability by preventing unexpected UI/Worker crashes on backend timeouts and ensures old timers do not leak memory during fast HMRs or mounts.
*   **Action**: Add a `destroy()` method to `PerformanceMonitor.ts` that clears the internal interval.
*   **Action**: Add explicit `destroy()` catch handlers for the `MarketWatcher` loop errors.
*   **Unit Test to Reproduce (Before Fix)**: Add a spy on `clearInterval` in `performanceMonitor.test.ts` to assert that `destroy` (not just `stop()`) accurately clears memory.

### Group 3: Standardization of i18n (`WARNING`)
**Justification:** Improves UX by ensuring no unmapped error codes are displayed to the user.
*   **Action**: In `NewsService`, map "Unknown" to a proper key.
