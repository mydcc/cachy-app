# Status & Risk Report (Institutional Grade Audit)

## 🔴 CRITICAL (Security & Data Integrity)

1.  **Missing HTML Sanitization in `markdownLoader.ts`**
    *   **Risk:** Cross-Site Scripting (XSS).
    *   **Finding:** The `loadInstruction` function uses `marked` to parse Markdown into HTML and returns it directly (`{ html: htmlContent }`). While the source files are currently local (`src/lib/assets/content/`), any future dynamic loading or compromise of these files could lead to arbitrary code execution in the client.
    *   **Recommendation:** Implement `isomorphic-dompurify` to sanitize the output of `marked` before returning it.

2.  **Potential Logic Flaw in `TradeService.flashClosePosition`**
    *   **Risk:** Incorrect Order Side / Financial Loss.
    *   **Finding:** The logic `const side: OMSOrderSide = positionSide === "long" ? "sell" : "buy";` assumes that a "long" position is always positive and a "short" position is always negative. While standard, edge cases in `OMS` (Order Management System) synchronization could theoretically lead to attempting to "close" a position that has already flipped or is zero, potentially opening a *new* opposite position instead of closing.
    *   **Recommendation:** Strictly validate that `position.amount` matches the expected direction (Positive for Long, Negative for Short) before generating the close order.

3.  **Unsafe Volume Default in `apiService.ts`**
    *   **Risk:** Corrupted Technical Indicators (VWAP, OBV).
    *   **Finding:** In `fetchBitunixKlines`, the volume is defaulted: `volume: d.volume || d.vol || new Decimal(0)`. If the API fails to return volume (e.g., partial outage), this injects `0` volume candles, which drastically skews volume-weighted indicators.
    *   **Recommendation:** If volume is missing from a Kline update, the candle should likely be considered invalid or explicitly marked, rather than defaulting to zero.

## 🟡 WARNING (Stability, UX, Maintenance)

1.  **Missing i18n Keys (Hardcoded Strings)**
    *   **Risk:** Poor User Experience for non-English users.
    *   **Finding:** `src/components/shared/LeftControlPanel.svelte` contains hardcoded strings:
        *   `title="Toggle Market Tiles"`
        *   `title="Toggle Market Sentiment"`
    *   **Recommendation:** Extract these to `src/locales/en.json` (e.g., `dashboard.toggleTiles`, `dashboard.toggleSentiment`).

2.  **Fragile "Fast Path" in `bitunixWs.ts`**
    *   **Risk:** Runtime crash on API Schema drift.
    *   **Finding:** The optimization block (Fast Path) manually casts fields: `typeof data.ip === 'number' ? String(data.ip) : data.ip`. If Bitunix changes the data structure (e.g., nesting changes), this code might throw or return `undefined` without the safety net of Zod (which is bypassed here).
    *   **Recommendation:** Wrap the Fast Path in a specific `try-catch` that falls back to the Zod validation path if an error occurs, ensuring resilience.

3.  **Loose Type Safety in `newsService.ts`**
    *   **Risk:** Application crash or blank news on API change.
    *   **Finding:** `fetchNews` fetches data from `cryptopanic` and `newsapi` and manually maps it: `results.map((item: any) => ...)`. There is no schema validation for the *incoming* fetch response, only for the *cached* IDB entry.
    *   **Recommendation:** Define Zod schemas for the external API responses (`CryptoPanicResponseSchema`, `NewsApiResponseSchema`) and validate before mapping.

4.  **Resource Leak Potential in `MarketWatcher` History Fetch**
    *   **Risk:** Memory Spike.
    *   **Finding:** `ensureHistory` accumulates results in `results: any[]` inside a loop. If `limit` is very large, this array grows indefinitely.
    *   **Recommendation:** Although capped by `effectiveBatches`, strictly typing this array to `Kline[]` and adding a sanity check on total size is recommended.

## 🔵 REFACTOR (Technical Debt)

1.  **Generic `tfToMs` Fallback**
    *   **Finding:** `tfToMs` in `marketWatcher.ts` returns `60000` (1 minute) if parsing fails. This could hide configuration errors (e.g., asking for "4h" but getting "1m" behavior if "4h" isn't parsed correctly).
    *   **Recommendation:** Throw an error or return `null` for invalid timeframes to fail fast.

2.  **`any` Usage in `TradeService`**
    *   **Finding:** `signedRequest` returns `Promise<T>` but implementation uses `data: any`.
    *   **Recommendation:** Tighten types where possible.
