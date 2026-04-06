# Cachy App - Security & Stability Analysis Report

## 🔴 CRITICAL: Risk of financial loss, crash, or security vulnerability

1.  **JSON.parse Precision Loss in API responses:**
    -   *Issue:* `tradeService.ts` line 403 uses `safeJsonParse(text)` which attempts to protect large numbers by wrapping them in strings. However, if the payload does not trigger `safeJsonParse`, `JSON.parse` might still be used implicitly in other areas or fetch responses. `TradeService` at line 118 parses Bitunix responses using `safeJsonParse`.
    -   *Risk:* Although `safeJsonParse` is used, native JS floats can lose precision for amounts and prices before they are converted to `Decimal.js` if standard `JSON.parse` is used anywhere else for order data. We need to ensure *all* API inputs passing amounts/prices go through `StrictDecimal` or `safeJsonParse`.
2.  **`Decimal.js` Check missing in `TradeSetupInputs` / Hardcoded floats:**
    -   *Issue:* The `TradeService` throws errors like `tradeErrors.invalidAmount` but `invalidAmount` is missing from the i18n keys for `tradeErrors` in JSON files (it is only in `apiErrors`).
3.  **Missing Error Keys causing Unhandled Exceptions:**
    -   *Issue:* In `tradeService.ts`, `throw new Error("tradeErrors.fetchFailed")` (Line 196) and `throw new Error("tradeErrors.invalidAmount")` (Line 440) are used. These keys DO NOT exist in `de.json`, `en.json` under `tradeErrors`. They exist under `apiErrors`. This causes localization to break or show raw keys, and potentially breaks UI error handlers expecting valid translations.
4.  **Race Condition / Thundering Herd in `NewsService`:**
    -   *Issue:* `fetchNews` implements Promise deduplication, but `cryptoPanicApiKey` uses `isQuotaExhausted` without a proper queue. It can launch multiple requests before the quota updates. The promise caching is good, but `SentimentAnalysis` relies on `newsHash = news[0].title`. If two different requests have the exact same title, they collide.
5.  **Unbounded Arrays / Memory Leaks:**
    -   *Issue:* In `MarketWatcher` (src/services/marketWatcher.ts), `ensureHistory` and `fillGaps` can allocate up to `MAX_GAP_FILL = 5000` empty candles *per gap*. If an API returns sparse data over a long period, `fillGaps` will blow up memory.

## 🟡 WARNING: Performance issue, UX error, missing i18n

1.  **Missing i18n Keys:**
    -   `tradeErrors.fetchFailed`
    -   `tradeErrors.invalidAmount`
    -   Both are missing in `src/locales/locales/de.json` and `en.json`, and `src/locales/schema.d.ts`.
2.  **Unnecessary Re-renders:**
    -   *Issue:* `marketState.data` is heavily mutated. The Svelte 5 `$effect` in `subscribe` (lines 802+) runs every time *any* property of `data` changes. For high-frequency updates, this causes the UI to freeze.
3.  **Error Handling (UX):**
    -   *Issue:* When `fetchTpSlOrders` fails (Line 508), it returns `[]` silently. The user thinks they have no orders, while the API might be down. This is dangerous for a trading app. It should show a warning indicator.

## 🔵 REFACTOR: Code smell, technical debt

1.  **Duplicate Error Maps:**
    -   `tradeErrors` vs `apiErrors`. Standardize these.
