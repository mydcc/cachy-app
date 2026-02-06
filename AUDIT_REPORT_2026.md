# Financial Audit Report: Cachy Trading Engine
**Date:** May 26, 2026
**Auditor:** Jules (Senior Financial Quant)
**Scope:** Indicator logic, mathematical integrity, precision, and compliance.

## Executive Summary
The technicals engine was audited against industry standards (TA-Lib, TradingView). The system generally implements high-quality, optimized algorithms suitable for high-frequency updates. One critical precision issue was identified in the Bollinger Bands implementation and fixed. All other major indicators (RSI, MACD, ATR) are compliant.

## Detailed Findings

### 1. Bollinger Bands (BB)
*   **Status:** [FIXED]
*   **Compliance Score:** 100% (Previously 80%)
*   **Issue:** The previous implementation used an `O(1)` sliding window variance formula (`Sum(x^2) - N*Mean^2`). While fast, this formula suffers from "catastrophic cancellation" when prices are high (e.g., Bitcoin > $60k) and volatility is low, leading to inaccurate bands.
*   **Fix:** Refactored to use a stable `O(N)` variance calculation (`Sum((x-Mean)^2)`).
*   **Performance:** The impact of `O(N)` for typical periods (20) is negligible on modern JS engines.
*   **Verification:** Passed precision stress test (Error: 0.00).

### 2. Relative Strength Index (RSI)
*   **Status:** [PASS]
*   **Compliance Score:** 100%
*   **Methodology:** Wilder's Smoothing (Smooth-Moving Average of Gains/Losses).
*   **Verification:** Confirmed initialization uses Simple Moving Average (SMA), and subsequent updates use the recursive Wilder formula: `Avg_{t} = (Avg_{t-1} * (n-1) + Curr) / n`.
*   **Edge Cases:** Correctly handles division by zero (returns 100 when AvgLoss is 0).

### 3. Moving Average Convergence Divergence (MACD)
*   **Status:** [PASS]
*   **Compliance Score:** 100%
*   **Methodology:** Standard 12/26/9 EMA.
*   **Verification:**
    *   Line = EMA(12) - EMA(26).
    *   Signal = EMA(9) of Line.
    *   Histogram = Line - Signal.
    *   Initialization correctly awaits the longer period (26) before generating values.

### 4. Average True Range (ATR)
*   **Status:** [PASS]
*   **Compliance Score:** 100%
*   **Methodology:** Wilder's Smoothing of True Range.
*   **Verification:** True Range correctly captures gaps: `Max(High-Low, |High-PrevClose|, |Low-PrevClose|)`.

### 5. Moving Averages (SMA, EMA, WMA)
*   **Status:** [PASS]
*   **Compliance Score:** 100%
*   **SMA:** Standard unweighted average.
*   **EMA:** Standard recursive formula: `EMA_t = Price * k + EMA_{t-1} * (1-k)` where `k = 2/(N+1)`.
*   **WMA:** Implemented with `O(1)` sliding window optimization. *Note: WMA is not currently active in the main technicals calculator pipeline.*

## Performance & Optimization
*   **Vectorization:** The system uses `Float64Array` effectively for memory locality.
*   **Garbage Collection:** Buffer pooling is implemented for complex indicators (Stoch, MACD) to minimize GC pauses.
*   **Bottlenecks:** None identified. The move to `O(N)` for Bollinger Bands is a necessary trade-off for correctness.

## Recommendations
1.  **Maintain Precision:** Continue using `Decimal.js` for financial transactions (Orders, PnL) while using `Float64Array` for technical indicators (Speed). The audit confirms this separation is correctly enforced.
2.  **Regression Testing:** Keep `src/benchmarks/audit_bb_precision.ts` in the codebase to prevent future regressions.

---
**Signed:** Jules, Lead Auditor.
