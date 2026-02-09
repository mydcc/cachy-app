# Status & Risk Report

## 🔴 CRITICAL: Risk of financial loss, crash, or security vulnerability

1.  **Precision Loss in Technical Indicators** (`src/utils/technicalsCalculator.ts`)
    *   **Issue:** The calculator converts `Decimal` values to native JavaScript `number` (float) using `parseFloat()` for all technical indicator calculations (RSI, MACD, etc.).
    *   **Risk:** Floating point inaccuracies can lead to incorrect signal generation (e.g., `RSI > 70.0000001` vs `69.9999999`), potentially causing financial loss if automated trading relies on these specific values.
    *   **Requirement:** The prompt explicitly states: "Use strictly decimal types for all price and quantity calculations".

2.  **Blocking Main Thread in Aggregator** (`src/lib/calculators/aggregator.ts`)
    *   **Issue:** The `getJournalAnalysis` function performs heavy synchronous calculations (performance, quality, direction, tag metrics) on the entire trade history.
    *   **Risk:** For users with a large number of trades (e.g., >1000), this will freeze the UI thread, causing the application to become unresponsive ("Application Not Responding").
    *   **Recommendation:** Offload to a Web Worker.

## 🟡 WARNING: Performance issue, UX error, missing i18n

1.  **Widespread Hardcoded Strings (Missing I18n)**
    *   **Issue:** Many components contain hardcoded English strings instead of using the `$_` translation helper.
    *   **Locations:**
        *   `src/components/shared/TechnicalsPanel.svelte` ("OBV", "Ichimoku", "Price:")
        *   `src/components/shared/MarketDashboardModal.svelte` ("RSI (1h)", "Score")
        *   `src/components/shared/TpSlEditModal.svelte` ("Trigger Price", "Amount", "Save", "Cancel")
        *   `src/components/shared/PerformanceMonitor.svelte` ("Analysis Time", "Memory")
        *   `src/components/shared/backgrounds/TradeFlowBackground.svelte` ("Warming Neural Core...")
    *   **Risk:** Poor UX for non-English users and inconsistent terminology.

2.  **Main Thread Fallback for Technicals** (`src/services/technicalsService.ts`)
    *   **Issue:** If the `technicals.worker.ts` fails or times out, the service falls back to `calculateTechnicalsInline`, which runs on the main thread.
    *   **Risk:** While a safety mechanism, if the worker fails due to data size, the main thread will likely freeze as well.

3.  **Data Integrity in Kline Fetching** (`src/services/apiService.ts`)
    *   **Issue:** `fetchBitunixKlines` filters out candles where volume is missing or zero, or open/close is zero.
    *   **Risk:** While this filters "bad" data, it might create gaps in the chart if the exchange returns valid but low-activity candles (zero volume is possible in illiquid markets).

4.  **Loose API Schema Validation** (`src/types/apiSchemas.ts`)
    *   **Issue:** `BitgetKlineSchema` uses `z.unknown()` for the tail of the tuple.
    *   **Risk:** Changes in the API response format might go undetected until runtime errors occur in consumption logic.

## 🔵 REFACTOR: Code smell, technical debt

1.  **Direct API Calls in Components** (`src/components/shared/TpSlEditModal.svelte`)
    *   **Issue:** The component makes a direct `fetch('/api/tpsl')` call instead of using `TradeService`.
    *   **Risk:** Inconsistent error handling, auth logic duplication, and harder testing. Logic should be centralized in `TradeService`.

2.  **Markdown HTML Sanitization** (`src/services/markdownLoader.ts`)
    *   **Issue:** The loader uses `marked` but relies on the source being trusted (local files).
    *   **Risk:** If the architecture changes to allow remote markdown or user input, this becomes an XSS vulnerability. `isomorphic-dompurify` should be applied explicitly.

3.  **Trade Form Accessibility**
    *   **Issue:** Some components (like `TpSlEditModal`) manage focus but could be improved (e.g., trapping focus within the modal).
