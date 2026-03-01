# Cachy App - Institutional Grade Status & Risk Report

Based on the forensic audit of the `cachy-app` codebase, the following critical vulnerabilities, performance bottlenecks, and UX issues have been identified.

## 🔴 CRITICAL: Risk of financial loss, crash, or security vulnerability.

1. **Precision Loss in API Sync (`src/routes/api/sync/+server.ts`)**
   - **Issue:** The endpoint uses `await request.json()` instead of the custom `safeJsonParse` utility.
   - **Impact:** High-precision floating-point numbers or large integers (like 19-digit `orderId`s from Bitunix) will silently lose precision during standard V8 `JSON.parse`. This can result in phantom orders, inability to cancel positions, or corrupt trade journals.
   - **Fix:** Replace `request.json()` with `safeJsonParse(await request.text())`.

2. **Unsafe Decimal Parsing Heuristic (`src/utils/utils.ts`)**
   - **Issue:** The `parseDecimal` function uses a dangerous heuristic for ambiguous comma inputs (e.g., `"1,200"`), guessing based on length whether it's a thousands separator or a decimal.
   - **Impact:** A user entering a price or quantity could have their input misread by a factor of 1000x (e.g., 1.2 BTC vs 1200 BTC), leading to devastating financial liquidations.
   - **Fix:** Implement strict localization formats. Commas should always be treated safely or explicitly parsed according to a user-defined locale, rather than relying on length heuristics.

3. **Weak Type Enforcement in Mappers (`src/services/mappers.ts`)**
   - **Issue:** `mapToOMSOrder` only logs a `warn` when it detects a numeric `orderId` exceeding `Number.MAX_SAFE_INTEGER`.
   - **Impact:** While it detects the issue, it allows the corrupted data to propagate into the system state, poisoning the order book and position tracking.
   - **Fix:** Escalate the warning to a `CRITICAL` log or throw an explicit `apiErrors.invalidResponse` to halt processing of corrupt data.

## 🟡 WARNING: Performance issue, UX error, missing i18n.

1. **Unclosed WebSocket & Telemetry Intervals (Memory Leaks)**
   - **Issue:** Several critical files instantiate `setInterval` without guaranteed cleanup in their `destroy()` or component unmount lifecycles.
   - **Locations:**
     - `src/stores/market.svelte.ts` (Telemetry loop)
     - `src/services/apiService.ts` (Cache cleanup loop)
     - `src/services/bitunixWs.ts` / `src/services/bitgetWs.ts` (Global monitor loops)
   - **Impact:** Over time, especially during hot-reloading or frequent reconnects, these orphaned intervals will pile up, degrading UI thread performance and causing zombie state updates.
   - **Fix:** Ensure every `setInterval` has a corresponding `clearInterval` mapped to the `destroy` method or Svelte component cleanup cycle.

2. **Missing i18n in Trade Inputs (`src/components/inputs/TradeSetupInputs.svelte`)**
   - **Issue:** Several UI elements contain hardcoded strings rather than utilizing the `$_` translation mechanism (e.g., placeholder text).
   - **Impact:** Breaks localization for non-English/German users, leading to a fragmented UX.
   - **Fix:** Replace all hardcoded strings with proper i18n keys from the locales dictionary.

3. **Hardcoded Error Messages Bypassing i18n (`src/routes/+layout.svelte` & API)**
   - **Issue:** Error states in layouts and API responses are hardcoded in English instead of utilizing structured error codes mapped to localized strings (e.g., `apiErrors.missingCredentials`).
   - **Impact:** Users see incomprehensible technical errors during network failures.
   - **Fix:** Implement standardized error objects with keys that map to the i18n system.

## 🔵 REFACTOR: Code smell, technical debt

1. **Dangerous Number Formatting (`src/utils/utils.ts`)**
   - **Issue:** The `formatApiNum` function attempts to prevent scientific notation by casting to `.toFixed(20)` and aggressively regex-stripping trailing zeros.
   - **Impact:** While functional, this string manipulation is fragile and prone to edge-case bugs when dealing with extremely small token fractions.
   - **Fix:** Refactor to leverage `Decimal.js`'s native `.toString()` with appropriately configured global precision settings, ensuring type safety and cleaner serialization.
