# Analysis Report: Systematic Maintenance & Hardening (Phase 1) - V8

**Date:** 2026-05-23
**Status:** Completed
**Focus:** Institutional Grade Hardening, Data Integrity, Resource Safety

## 1. Data Integrity & Mapping

### 🔴 CRITICAL: CSV Import ID Collision & Precision Loss
- **Location:** `src/services/csvService.ts`
- **Issue:**
  1.  **Precision Loss:** The service uses `parseFloat(originalIdAsString)` for IDs. If an ID exceeds `Number.MAX_SAFE_INTEGER` (2^53-1), it loses precision immediately.
  2.  **Weak Hashing:** For large IDs (>=16 chars), it falls back to a custom hash: `hash = (hash * 33) ^ charCode`. The result is cast to a 32-bit integer (`hash >>> 0`). This guarantees collisions for high-volume traders or random distribution of exchange IDs, leading to data corruption (overwriting trades).
- **Risk:** High. Users importing large trade histories will experience data corruption.

### 🟡 WARNING: BitunixWS "Fast Path" Safety
- **Location:** `src/services/bitunixWs.ts`
- **Issue:** The "Fast Path" optimization manually casts fields (e.g., `ip`, `fr`) to strings. While `safeJsonParse` is used upstream (mitigating immediate JSON crash), the logic relies on `typeof val === 'number'` checks. If `safeJsonParse`'s regex replacement fails or edge cases occur, large numbers might still be passed as truncated numbers.
- **Mitigation:** The logic is "safe-ish" but fragile. A strictly typed schema validation (Zod) is bypassed for performance.

## 2. Resource Management & Performance

### 🟡 WARNING: MarketWatcher Concurrency Logic Flaw
- **Location:** `src/services/marketWatcher.ts`
- **Issue:** The `pruneZombieRequests` method decrements the `inFlight` counter when a request times out (30s). However, if the network request eventually completes later, the `finally` block of `pollSymbolChannel` decrements `inFlight` *again*.
- **Impact:** The `inFlight` counter can drift below the actual number of active requests, effectively disabling the `maxConcurrentPolls` throttle during network instability, leading to congestion collapse.

### 🟡 WARNING: Excessive GC in WebSocket Handler
- **Location:** `src/services/bitunixWs.ts`
- **Issue:** In the "Fast Path", a shallow copy of the message is created for *every* ticker update: `const safeMessage = { ...message, data: safeData };`.
- **Impact:** High Garbage Collection pressure during high-volatility events, potentially causing UI stutter.

## 3. UI/UX & Internationalization (I18n)

### 🟡 WARNING: Hardcoded Strings
- **Location:** `src/components/settings/tabs/ConnectionsTab.svelte`
- **Issue:** Strings like `<label>API Key</label>` are hardcoded, ignoring existing keys in `en.json`.
- **Impact:** Inconsistent localization for non-English users.

### 🟡 WARNING: API Error Leakage
- **Location:** `src/routes/api/orders/+server.ts` & `src/services/tradeService.ts`
- **Issue:** The backend forwards raw error messages from the exchange (e.g., `res.msg`) directly to the frontend. `TradeService` wraps these in `BitunixApiError`.
- **Impact:** Users see technical English/Chinese error messages instead of user-friendly, localized instructions (e.g., "Parameter Error" instead of "Invalid Order Size").

## 4. Security & Logic

### 🔵 REFACTOR: Optimistic UI "Phantom Orders"
- **Location:** `src/services/tradeService.ts` (`flashClosePosition`)
- **Issue:** If a "Flash Close" network request times out, the optimistic order remains "unconfirmed". The service attempts a background sync (`fetchOpenPositionsFromApi`). If this sync *also* fails (e.g., persistent outage), the user sees a "Phantom Order" that may or may not exist.
- **Recommendation:** Implement a more robust local queue for pending verifications that survives page refreshes or longer outages.

## Prioritized Action Plan (Preview)

1.  **[CRITICAL] Rewrite CSV ID Handling:** Replace `parseFloat` and weak hashing with `BigInt` or `Decimal` string handling. Ensure unique IDs are preserved.
2.  **[WARNING] Fix MarketWatcher Concurrency:** Refactor `inFlight` tracking to use unique Request IDs to prevent double-counting.
3.  **[WARNING] Hardening Error Handling:** intercept raw API errors in `+server.ts` and map them to `apiErrors.*` keys.
4.  **[WARNING] Fix I18n:** Replace hardcoded strings in Settings.
