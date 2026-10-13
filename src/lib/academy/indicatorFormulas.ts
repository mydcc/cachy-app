/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * FEAT-0681 — the arithmetic behind each indicator, as typeset maths.
 *
 * Language-neutral on purpose: a formula reads the same in every locale, so
 * unlike the lesson prose it has no DE/EN pair and no translation key — the
 * same reasoning ADR-0025 gives for `params` and `placement`. Each entry is a
 * KaTeX display block (`$$ … $$`), which the lesson view renders through the
 * Markdown action the two pattern tabs already use.
 *
 * Every entry describes what `src/lib/rules/indicatorSeries.ts` computes. The
 * rest of each formula is reviewed against the engine by hand — a test can pin
 * that a formula exists and typesets, not that a coefficient is right — so the
 * three places Cachy departs from a textbook are pinned explicitly instead:
 *
 * - the Bollinger bandwidth is a percentage of the middle band (`× 100`), not
 *   the bare ratio, so it matches the `%` the Technicals panel prints;
 * - both Ichimoku spans are displaced forward by 26 candles;
 * - CCI is computed over the typical price (HLC3) by default, not the close.
 *
 * `indicatorFormulas.test.ts` pins the set to the registry — a new indicator
 * without a formula fails CI rather than rendering an empty card — plus each
 * formula's typeset output and the three departures above.
 */

export const INDICATOR_FORMULAS: Readonly<Record<string, string>> = {
    rsi: String.raw`$$RSI_n = 100 - \frac{100}{1 + \dfrac{\mathrm{Wilder}_n(\Delta^{+})}{\mathrm{Wilder}_n(\Delta^{-})}}$$`,

    sma: String.raw`$$SMA_n = \frac{1}{n}\sum_{i=0}^{n-1} C_{t-i}$$`,

    ema: String.raw`$$EMA_t = \alpha\,C_t + (1-\alpha)\,EMA_{t-1}, \qquad \alpha = \frac{2}{n+1}$$`,

    wma: String.raw`$$WMA_n = \frac{\sum_{i=0}^{n-1} (n-i)\,C_{t-i}}{\sum_{i=0}^{n-1} (n-i)}$$`,

    hma: String.raw`$$HMA_n = WMA_{\sqrt{n}}\Bigl(2\,WMA_{n/2}(C) - WMA_{n}(C)\Bigr)$$`,

    vwma: String.raw`$$VWMA_n = \frac{\sum_{i=0}^{n-1} C_{t-i}\,V_{t-i}}{\sum_{i=0}^{n-1} V_{t-i}}$$`,

    momentum: String.raw`$$MOM_n = C_t - C_{t-n}$$`,

    williams_r: String.raw`$$\%R_n = -100 \cdot \frac{HH_n - C_t}{HH_n - LL_n}$$`,

    cci: String.raw`$$CCI_n = \frac{TP_t - SMA_n(TP)}{0.015 \cdot MD_n}, \qquad TP = \frac{H + L + C}{3}$$`,

    atr: String.raw`$$TR_t = \max\bigl(H_t - L_t,\ \lvert H_t - C_{t-1} \rvert,\ \lvert L_t - C_{t-1} \rvert\bigr), \qquad ATR_n = \mathrm{Wilder}_n(TR)$$`,

    choppiness: String.raw`$$CHOP_n = 100 \cdot \frac{\log_{10}\left(\dfrac{\sum_{i=0}^{n-1} TR_{t-i}}{HH_n - LL_n}\right)}{\log_{10} n}$$`,

    mfi: String.raw`$$MFI_n = 100 - \frac{100}{1 + \dfrac{\sum MF^{+}}{\sum MF^{-}}}, \qquad MF = TP \cdot V$$`,

    ao: String.raw`$$AO = SMA_{fast}(HL2) - SMA_{slow}(HL2), \qquad HL2 = \frac{H + L}{2}$$`,

    stochastic: String.raw`$$\%K = SMA_{k}\left(100 \cdot \frac{C_t - LL_n}{HH_n - LL_n}\right), \qquad \%D = SMA_{d}(\%K)$$`,

    stoch_rsi: String.raw`$$StochRSI = \frac{RSI - \min_n(RSI)}{\max_n(RSI) - \min_n(RSI)}, \qquad \%K = SMA_{k}(StochRSI), \quad \%D = SMA_{d}(\%K)$$`,

    adx: String.raw`$$+DI = 100 \cdot \frac{\mathrm{Wilder}(+DM)}{ATR}, \quad -DI = 100 \cdot \frac{\mathrm{Wilder}(-DM)}{ATR}, \quad DX = 100 \cdot \frac{\lvert +DI - {-DI} \rvert}{+DI + {-DI}}, \quad ADX = \mathrm{Wilder}(DX)$$`,

    super_trend: String.raw`$$ST_t = \begin{cases} \max(BU_t,\ ST_{t-1}) & C_t > ST_{t-1} \\[2pt] \min(BL_t,\ ST_{t-1}) & C_t < ST_{t-1} \end{cases}, \qquad BU/BL = \frac{H + L}{2} \pm m \cdot ATR_n$$`,

    parabolic_sar: String.raw`$$SAR_t = SAR_{t-1} + AF \cdot (EP - SAR_{t-1}), \qquad AF \in [\,a_0,\ a_{\max}\,]$$`,

    ichimoku: String.raw`$$Tenkan = \frac{HH_{n_1} + LL_{n_1}}{2}, \quad Kijun = \frac{HH_{n_2} + LL_{n_2}}{2}, \quad Senkou_A = \frac{Tenkan + Kijun}{2}\ \text{(+26)}, \quad Senkou_B = \frac{HH_{n_3} + LL_{n_3}}{2}\ \text{(+26)}$$`,

    bollinger: String.raw`$$M = SMA_n(C), \quad U/L = M \pm k\,\sigma_n, \qquad \%B = \frac{C - L}{U - L}, \quad BW = 100 \cdot \frac{U - L}{M}$$`,

    obv: String.raw`$$OBV_t = OBV_{t-1} + \begin{cases} +V_t & C_t > C_{t-1} \\ 0 & C_t = C_{t-1} \\ -V_t & C_t < C_{t-1} \end{cases}$$`,

    volume_ma: String.raw`$$VMA_n = SMA_n(V)$$`,

    macd: String.raw`$$MACD = EMA_{f}(C) - EMA_{s}(C), \quad Signal = EMA_{sig}(MACD), \quad Hist = MACD - Signal$$`,
};
