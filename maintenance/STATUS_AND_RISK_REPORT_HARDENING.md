# Status & Risk Report (Hardening Phase)

## 1. Data Integrity & Mapping

### 🔴 CRITICAL: MarketWatcher Backfill Failure
**File:** `src/services/marketWatcher.ts` (L386-388)
- **Problem:** In `ensureHistory`, the backfill loop filters chunks using `KlineRawSchema.safeParse`.
  - `KlineRawSchema` expects `string | number` for OHLCV values.
  - `apiService.fetchBitunixKlines` returns `Kline[]` objects where OHLCV are `Decimal` instances.
  - `Decimal` is neither `string` nor `number`, causing validation to fail.
- **Impact:** The backfill logic silently discards all valid data, resulting in incomplete chart history.
- **Recommendation:** Update `KlineRawSchema` to accept `Decimal` or convert `Decimal` to string before validation.

### 🔴 CRITICAL: NewsService Sentiment Analysis Type Safety
**File:** `src/services/newsService.ts` (L365)
- **Problem:** `analyzeSentiment` casts `data.analysis` directly to `SentimentAnalysis` without runtime validation.
  - `const analysis: SentimentAnalysis = data.analysis;`
- **Impact:** If the API returns malformed data (e.g., missing fields, wrong types), the app will crash when accessing properties of `analysis`.
- **Recommendation:** Implement a Zod schema for `SentimentAnalysis` and validate the API response.

### 🔴 CRITICAL: TradeService TP/SL Fetch Type Safety
**File:** `src/services/tradeService.ts` (L435)
- **Problem:** `fetchTpSlOrders` casts the API response to `TpSlOrder[]` without validation.
  - `return (Array.isArray(data) ? data : data.rows || []) as TpSlOrder[];`
- **Impact:** Similar to NewsService, malformed API responses can cause runtime crashes in components consuming this data.
- **Recommendation:** Implement a Zod schema for `TpSlOrder` and validate the API response.

### 🟡 WARNING: BitunixWs Numeric Overflow Risk
**File:** `src/services/bitunixWs.ts` (L1066)
- **Problem:** Checks for `orderId > MAX_SAFE_INTEGER` but relies on `safeJsonParse` which handles large integers as strings only if they match a regex or are quoted.
- **Impact:** Extremely large order IDs might lose precision if not handled carefully during JSON parsing or Zod coercion.
- **Recommendation:** Ensure `BitunixOrderSchema` explicitly handles large numbers as strings.

### 🟡 WARNING: SafeJsonParse Masking Errors
**File:** `src/components/inputs/PortfolioInputs.svelte` (L154)
- **Problem:** `safeJsonParse` returns `{}` on failure (e.g., HTML response for 500 error).
  - `if (!res.ok) { throw new Error(data.error || ...); }`
  - If `data` is empty object, `data.error` is undefined, falling back to generic error, potentially masking the root cause.
- **Recommendation:** Check if `safeJsonParse` returned a valid object with expected structure before accessing properties.

## 2. Resource Management & Performance

### 🟡 WARNING: Aggressive News Fetching
**File:** `src/services/newsService.ts` (L137)
- **Problem:** `shouldFetchNews` returns `true` if `cached.items.length < MIN_NEWS_PER_COIN`.
- **Impact:** For rare coins with few news items, this forces an API call on every check, bypassing TTL and potentially hitting rate limits.
- **Recommendation:** Respect TTL even if item count is low, or implement a separate "no news found" cache state.

### 🟡 WARNING: BitunixWs Unused Methods & Typing
**File:** `src/services/bitunixWs.ts`
- **Problem:**
  - `resubscribePublic` method is defined but never used.
  - `syntheticSubs` is used with `// @ts-ignore` (L904), lacking proper type definition in the class.
- **Impact:** Dead code increases maintenance burden; loose typing risks runtime errors.
- **Recommendation:** Remove unused code and properly type `syntheticSubs`.

### 🔵 REFACTOR: MarketWatcher Code Duplication
**File:** `src/services/marketWatcher.ts` (L519)
- **Problem:** `pollSymbolChannel` creates an IIFE to handle the promise logic.
- **Impact:** Reduces readability.
- **Recommendation:** Refactor into a cleaner async method structure.

## 3. UI/UX & Accessibility

### 🟡 WARNING: PortfolioInputs UI Consistency
**File:** `src/components/inputs/PortfolioInputs.svelte`
- **Problem:** Uses inline SVGs for lock icons instead of the shared `Icon` component.
- **Impact:** Inconsistent styling and potential maintenance issues if icon system changes.
- **Recommendation:** Replace inline SVGs with `Icon` component.

### 🟡 WARNING: TradeService Partial Failure Handling
**File:** `src/services/tradeService.ts` (L362)
- **Problem:** `closeAllPositions` throws a generic error if *any* position fails to close.
- **Impact:** User doesn't know which positions failed and which succeeded.
- **Recommendation:** Return a detailed result object indicating success/failure per position.

## 4. Security & Validation

### 🟡 WARNING: PortfolioInputs Regex
**File:** `src/components/inputs/PortfolioInputs.svelte` (L108)
- **Problem:** `validateInput` uses regex `/^\d*\.?\d*$/` which allows `.` (just a dot).
- **Impact:** `parseFloat(".")` is `NaN`, handled by `validateInput` returning "0".
- **Recommendation:** Ensure regex handles edge cases or rely on robust parsing.

## Summary

The codebase has critical issues in data validation (Schema mismatches) that are breaking core functionality like history backfill. There are also significant risks in API response handling (unsafe casting) that could lead to crashes. Resource management is generally good but has some aggressive fetching logic. UI consistency can be improved.
