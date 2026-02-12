# Implementation Plan (Hardening Phase)

Based on the findings in `maintenance/STATUS_AND_RISK_REPORT_HARDENING.md`, this plan outlines the necessary steps to fix critical issues and improve the overall stability of the codebase.

## 1. Data Integrity & Mapping Fixes

### 1.1 Fix MarketWatcher Backfill Logic (CRITICAL)
- **File:** `src/services/marketWatcher.ts`
- **Action:**
  - Update the `fillGaps` logic and the chunk filtering in `ensureHistory` to handle `Decimal` objects correctly.
  - Specifically, modify the `.filter` condition: `KlineRawSchema.safeParse(k)` fails on Decimals. Either convert `k` to plain object before parsing or loosen `KlineRawSchema` to accept `Decimal` (but `KlineRawSchema` is `z.object` with `z.number/string`).
  - Better approach: Since `apiService` already returns valid `Kline[]` (with Decimals), rely on that type and skip `KlineRawSchema` validation in `ensureHistory` *or* map `Decimal` to string for validation if strict raw schema is required.
  - Given `marketState.updateSymbolKlines` expects `Kline[]`, we should just trust `apiService` return type and remove the `KlineRawSchema` check in the backfill loop, or map it to `KlineRaw` if needed for `fillGaps`.
  - `fillGaps` expects `KlineRaw[]` (where values are `string|number`). If `apiService` returns `Kline[]` (Decimals), we need to decide whether `fillGaps` should support `Decimal` or if we convert. `fillGaps` uses `curr.time` and creates new candles with `prev.close`.
  - **Decision:** Update `fillGaps` to support `Kline` (Decimal) input/output to maintain precision. This avoids converting back and forth.

### 1.2 Harden NewsService Sentiment Analysis (CRITICAL)
- **File:** `src/services/newsService.ts`
- **Action:**
  - Define `SentimentAnalysisResponseSchema` using Zod in `src/services/newsService.ts` (or `types/apiSchemas.ts`).
  - In `analyzeSentiment`, parse `data` using this schema.
  - Handle validation errors gracefully (return default/error state instead of crashing).

### 1.3 Harden TradeService TP/SL Fetch (CRITICAL)
- **File:** `src/services/tradeService.ts`
- **Action:**
  - Define `TpSlOrderSchema` in `src/types/apiSchemas.ts`.
  - In `fetchTpSlOrders`, validate the API response using `TpSlOrderSchema.array().parse(data)` or `safeParse`.
  - Filter out invalid items and log warnings.

## 2. Resource Management & Performance Fixes

### 2.1 Optimize News Fetching Strategy (WARNING)
- **File:** `src/services/newsService.ts`
- **Action:**
  - Modify `shouldFetchNews` to respect TTL even if item count is low.
  - Add a "last check time" to `NewsCacheEntry` to prevent spamming for rare coins.

### 2.2 Clean Up BitunixWs (WARNING/REFACTOR)
- **File:** `src/services/bitunixWs.ts`
- **Action:**
  - Remove unused `resubscribePublic`.
  - Add proper type definition for `syntheticSubs` property in the class.
  - Remove unused exports `isPriceData`, `isTickerData` (if truly unused).

## 3. UI/UX & Accessibility Fixes

### 3.1 Standardize PortfolioInputs Icons (WARNING)
- **File:** `src/components/inputs/PortfolioInputs.svelte`
- **Action:**
  - Import `icons` from `src/lib/constants` (or add lock icons there).
  - Replace inline `<svg>` with `<Icon data={...} />`.

### 3.2 Improve TradeService Error Feedback (WARNING)
- **File:** `src/services/tradeService.ts`
- **Action:**
  - Update `closeAllPositions` to return `Promise.allSettled` results.
  - (Optional) Enhance UI to display which positions failed to close.

## 4. Test Cases for Critical Bugs

### 4.1 MarketWatcher Backfill Test
- **File:** `src/services/marketWatcher.test.ts` (create if needed or use existing)
- **Test:**
  - Mock `apiService.fetchBitunixKlines` to return `Kline[]` with `Decimal` values.
  - Call `marketWatcher.ensureHistory`.
  - Verify that `marketState.updateSymbolKlines` is called with the backfilled data.
  - (Currently it fails because `filter` removes everything).

### 4.2 NewsService Validation Test
- **File:** `src/services/newsService.test.ts`
- **Test:**
  - Mock API response with malformed sentiment data (missing fields).
  - Call `analyzeSentiment`.
  - Verify it returns default "UNCERTAIN" state or throws controlled error, instead of crashing.

## Execution Order
1.  **Phase 1: Critical Data Fixes** (MarketWatcher, NewsService, TradeService).
2.  **Phase 2: Resource & Cleanup** (News Fetching, BitunixWs).
3.  **Phase 3: UI Standardization** (PortfolioInputs).
