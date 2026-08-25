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

use rust_decimal::Decimal;
use rust_decimal::MathematicalOps;
use wasm_bindgen::prelude::*;

use rust_decimal_macros::dec;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::collections::VecDeque;
use std::str::FromStr;

/// `Decimal` division panics on a zero divisor, where the `f64` arithmetic this
/// engine replaced produced `NaN`/`Inf` and simply rendered a garbage
/// indicator. A panic inside WASM tears down the calculator instance and takes
/// the whole Technicals panel with it, so every divisor that can reach zero
/// from settings or from market data goes through here instead.
#[inline]
fn safe_div(numerator: Decimal, divisor: Decimal) -> Decimal {
    numerator.checked_div(divisor).unwrap_or(Decimal::ZERO)
}

/// `log10` is undefined for values <= 0 and `MathematicalOps::log10` panics
/// there. Same reasoning as `safe_div`.
#[inline]
fn safe_log10(value: Decimal) -> Decimal {
    if value <= Decimal::ZERO {
        return Decimal::ZERO;
    }
    value.checked_log10().unwrap_or(Decimal::ZERO)
}

/// Parse a series of decimal strings coming from JS. An unparseable entry
/// falls back to zero rather than aborting the whole series — the caller
/// always sends a positionally aligned OHLCV set and dropping an entry would
/// desynchronise the buffers.
fn parse_decimals(values: &[String]) -> Vec<Decimal> {
    values
        .iter()
        .map(|v| Decimal::from_str(v).unwrap_or(Decimal::ZERO))
        .collect()
}

#[derive(Serialize, Deserialize, Default)]
pub struct IndicatorSettings {
    #[serde(default)]
    pub ema: Vec<EmaSettings>,
    #[serde(default)]
    pub sma: Vec<SmaSettings>,
    #[serde(default)]
    pub wma: Vec<WmaSettings>,
    #[serde(default)]
    pub vwma: Vec<VwmaSettings>,
    #[serde(default)]
    pub hma: Vec<HmaSettings>,
    #[serde(default)]
    pub rsi: Vec<RsiSettings>,
    #[serde(default)]
    pub macd: Vec<MacdSettings>,
    #[serde(default)]
    pub bb: Vec<BbSettings>,
    #[serde(default)]
    pub atr: Vec<AtrSettings>,
    #[serde(default)]
    pub stoch: Vec<StochSettings>,
    #[serde(default)]
    pub cci: Vec<CciSettings>,
    #[serde(default)]
    pub adx: Vec<AdxSettings>,
    #[serde(default)]
    pub supertrend: Vec<SuperTrendSettings>,
    #[serde(default)]
    pub mom: Vec<MomSettings>,
    #[serde(default)]
    pub wr: Vec<WrSettings>,
    #[serde(default)]
    pub volma: Vec<VolMaSettings>,
    #[serde(default)]
    pub pivots: Vec<PivotSettings>,
    #[serde(default)]
    pub psar: Vec<PsarSettings>,
    #[serde(default)]
    pub chop: Vec<ChopSettings>,
    #[serde(default)]
    pub vwap: Vec<VwapSettings>,
    #[serde(default)]
    pub mfi: Vec<MfiSettings>,
}

impl IndicatorSettings {
    /// Drop every indicator whose configured period cannot produce a result.
    ///
    /// Most period inputs in the settings UI have no lower bound, so a zero
    /// (or, for HMA and CHOP, a one) reaches this module and would end up as a
    /// zero divisor. Under `f64` that produced a `NaN` reading; under `Decimal`
    /// it panics. Dropping the indicator here keeps the panel alive and simply
    /// omits the misconfigured reading — the same outcome as before, without
    /// the trap.
    fn drop_unusable_periods(&mut self) {
        self.ema.retain(|s| s.length >= 1);
        self.sma.retain(|s| s.length >= 1);
        self.wma.retain(|s| s.length >= 1);
        self.vwma.retain(|s| s.length >= 1);
        // HMA divides by the weight sum of length/2, which is zero below 2.
        self.hma.retain(|s| s.length >= 2);
        self.rsi.retain(|s| s.length >= 1);
        self.macd.retain(|s| s.fast >= 1 && s.slow >= 1 && s.signal >= 1);
        self.bb.retain(|s| s.length >= 1);
        self.atr.retain(|s| s.length >= 1);
        self.stoch.retain(|s| s.k >= 1 && s.d >= 1 && s.smooth >= 1);
        self.cci.retain(|s| s.length >= 1);
        self.adx.retain(|s| s.length >= 1);
        self.supertrend.retain(|s| s.length >= 1);
        self.mom.retain(|s| s.length >= 1);
        self.wr.retain(|s| s.length >= 1);
        self.volma.retain(|s| s.length >= 1);
        // CHOP divides by log10(length), which is zero at 1.
        self.chop.retain(|s| s.length >= 2);
        self.mfi.retain(|s| s.length >= 1);
    }
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct EmaSettings {
    pub length: usize,
}
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct SmaSettings {
    pub length: usize,
}
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct WmaSettings {
    pub length: usize,
}
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct VwmaSettings {
    pub length: usize,
}
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct HmaSettings {
    pub length: usize,
}
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct RsiSettings {
    pub length: usize,
}
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct MacdSettings {
    pub fast: usize,
    pub slow: usize,
    pub signal: usize,
}
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct BbSettings {
    pub length: usize,
    pub std_dev: Decimal,
}
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct AtrSettings {
    pub length: usize,
}
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct StochSettings {
    pub k: usize,
    pub d: usize,
    pub smooth: usize,
}
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct CciSettings {
    pub length: usize,
}
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct AdxSettings {
    pub length: usize,
}
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct SuperTrendSettings {
    pub length: usize,
    pub multiplier: Decimal,
}
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct MomSettings {
    pub length: usize,
}
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct WrSettings {
    pub length: usize,
}
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct VolMaSettings {
    pub length: usize,
}
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct PivotSettings {
    pub type_: String,
}
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct PsarSettings {
    pub start: Decimal,
    pub increment: Decimal,
    pub max: Decimal,
}
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct ChopSettings {
    pub length: usize,
}
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct VwapSettings {
    pub anchor: String,
}
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct MfiSettings {
    pub length: usize,
}

struct EmaState {
    k: Decimal,
    value: Decimal,
    initialized: bool,
}
struct SmaState {
    sum: Decimal,
    initialized: bool,
}
struct WmaState {
    weighted_sum: Decimal,
    price_sum: Decimal,
    initialized: bool,
}
struct VwmaState {
    sum_pv: Decimal,
    sum_vol: Decimal,
    initialized: bool,
}
struct HmaState {
    wma_half: Decimal,
    wma_full: Decimal,
    /// Latest WMA(sqrt(n)) over the raw hull series — maintained by shift()
    /// so state stays warm between updates; update() computes its own
    /// prospective value including the current candle.
    _sqrt_wma: Decimal,
    /// Rolling raw-hull series (2·WMA(n/2) − WMA(n)), capped at sqrt(n).
    sqrt_buf: VecDeque<Decimal>,
    half_len: usize,
    sqrt_len: usize,
    initialized: bool,
}
struct RsiState {
    avg_gain: Decimal,
    avg_loss: Decimal,
    prev_close: Decimal,
    initialized: bool,
}
struct MacdState {
    ema_fast: Decimal,
    ema_slow: Decimal,
    signal_val: Decimal,
    k_fast: Decimal,
    k_slow: Decimal,
    k_signal: Decimal,
    initialized: bool,
}
struct BbState {
    sum: Decimal,
    sum_sq: Decimal,
    std_dev_mult: Decimal,
    initialized: bool,
}
struct AtrState {
    value: Decimal,
    prev_close: Decimal,
    initialized: bool,
}
struct StochState {
    /// Raw %K values — feeds the D line (SMA of raw K).
    k_buffer: VecDeque<Decimal>,
    /// Smoothed %K values — the reference applies SMA(kSmoothing) to raw K
    /// before emitting Stoch.K; D is the SMA over that smoothed series
    /// (BUG-0315: the smoothing was previously ignored).
    smoothed_buf: VecDeque<Decimal>,
    d_val: Decimal,
    k_len: usize,
    d_len: usize,
    smooth: usize,
    initialized: bool,
}
struct MomState {
    initialized: bool,
}
struct WrState {
    initialized: bool,
}
struct VolMaState {
    sum: Decimal,
    initialized: bool,
}

#[allow(dead_code)]
struct CciState {
    tp_buffer: VecDeque<Decimal>,
    sum_tp: Decimal,
    initialized: bool,
}
#[allow(dead_code)]
struct AdxState {
    tr_smooth: Decimal,
    pdm_smooth: Decimal,
    ndm_smooth: Decimal,
    dx_smooth: Decimal,
    prev_high: Decimal,
    prev_low: Decimal,
    prev_close: Decimal,
    initialized: bool,
}
#[allow(dead_code)]
struct SuperTrendState {
    atr: Decimal,
    upper: Decimal,
    lower: Decimal,
    trend: i32,
    prev_close: Decimal,
    initialized: bool,
    multiplier: Decimal,
}
#[allow(dead_code)]
struct ChopState {
    highs: VecDeque<Decimal>,
    lows: VecDeque<Decimal>,
    tr_buffer: VecDeque<Decimal>,
    sum_tr: Decimal,
    prev_close: Decimal,
    initialized: bool,
}
struct MfiState {
    pos_flow: VecDeque<Decimal>,
    neg_flow: VecDeque<Decimal>,
    sum_p: Decimal,
    sum_n: Decimal,
    prev_tp: Decimal,
    initialized: bool,
}
struct VwapState {
    cum_vol: Decimal,
    cum_pv: Decimal,
    last_t: Decimal,
}
#[derive(Default, Clone, Copy)]
pub struct PivotState {
    pub p: Decimal,
    pub r1: Decimal,
    pub r2: Decimal,
    pub r3: Decimal,
    pub s1: Decimal,
    pub s2: Decimal,
    pub s3: Decimal,
    pub basis_h: Decimal,
    pub basis_l: Decimal,
    pub basis_c: Decimal,
    /// Unused — no pivot formula (classic/woodie/camarilla/fibonacci) needs
    /// the open. Kept for struct parity with the TS basis shape; a future
    /// pivot type that requires `open` MUST extend `compute_pivot_levels`
    /// and thread it through initialize()/shift() as well.
    pub basis_o: Decimal,
    initialized: bool,
}
#[allow(dead_code)]
#[derive(Default, Clone, Copy)]
pub struct PsarState {
    pub sar: Decimal,
    pub ep: Decimal,
    pub af: Decimal,
    pub is_long: bool,
    pub max_af: Decimal,
    pub inc_af: Decimal,
    pub prev_high: Decimal,
    pub prev_low: Decimal,
    /// Second-previous bar range, needed for the two-bar SAR clamp that the
    /// reference implementation applies (i > 1 branch).
    pub prev2_high: Decimal,
    pub prev2_low: Decimal,
    initialized: bool,
}

#[derive(Serialize)]
struct OutputData {
    #[serde(rename = "movingAverages")]
    moving_averages: HashMap<String, Decimal>,
    oscillators: HashMap<String, Decimal>,
    volatility: HashMap<String, Decimal>,
    pivots: HashMap<String, Decimal>,
}

/// One Parabolic SAR step, mirroring `JSIndicators.psar` in
/// `src/utils/indicators.ts` exactly — including the two-bar clamp quirk and
/// the reversal order of assignments. Takes the previous state plus the two
/// previous bars' ranges explicitly (during history replay those come from
/// the arrays, once seeded they live in the state). Returns the advanced
/// state and the new SAR value.
#[allow(clippy::too_many_arguments)]
fn psar_step(
    mut st: PsarState,
    h: Decimal,
    l: Decimal,
    prev1_high: Decimal,
    prev1_low: Decimal,
    apply_second_clamp: bool,
    prev2_high: Decimal,
    prev2_low: Decimal,
) -> (PsarState, Decimal) {
    let start = st.inc_af; // JS calls it `start`; same value as initial AF
    let increment = st.inc_af;
    let max = st.max_af;

    // Next SAR = Prior SAR + Prior AF * (Prior EP - Prior SAR)
    let mut next_sar = st.sar + st.af * (st.ep - st.sar);

    // Constraint: SAR cannot be within previous bars' range
    if st.is_long {
        if next_sar > prev1_low {
            next_sar = prev1_low;
        }
        if apply_second_clamp && next_sar > prev2_low {
            next_sar = prev2_low;
        }
    } else {
        if next_sar < prev1_high {
            next_sar = prev1_high;
        }
        if apply_second_clamp && next_sar < prev2_high {
            next_sar = prev2_high;
        }
    }

    // Check for Reversal
    let mut reversed = false;
    if st.is_long {
        if l < next_sar {
            st.is_long = false;
            reversed = true;
            next_sar = st.ep;
            st.ep = l;
            st.af = start;
        }
    } else {
        if h > next_sar {
            st.is_long = true;
            reversed = true;
            next_sar = st.ep;
            st.ep = h;
            st.af = start;
        }
    }

    if !reversed {
        if st.is_long {
            if h > st.ep {
                st.ep = h;
                st.af = std::cmp::min(st.af + increment, max);
            }
        } else {
            if l < st.ep {
                st.ep = l;
                st.af = std::cmp::min(st.af + increment, max);
            }
        }
    }

    st.sar = next_sar;
    (st, st.sar)
}

/// Classic pivot-level formulas, mirroring `calculatePivotsFromValues` in
/// `src/utils/indicators.ts`. Returns (p, r1, r2, r3, s1, s2, s3).
fn compute_pivot_levels(
    type_: &str,
    high: Decimal,
    low: Decimal,
    close: Decimal,
) -> (Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal) {
    match type_ {
        "woodie" => {
            let p = (high + low + close * Decimal::TWO) / Decimal::from(4);
            (
                p,
                p * Decimal::TWO - low,
                p + high - low,
                high + (p - low) * Decimal::TWO,
                p * Decimal::TWO - high,
                p - high + low,
                low - (high - p) * Decimal::TWO,
            )
        }
        "camarilla" => {
            let range = high - low;
            let k = Decimal::new(11, 1); // 1.1
            (
                close,
                close + range * k / Decimal::from(4),
                close + range * k / Decimal::from(6),
                close + range * k / Decimal::from(12),
                close - range * k / Decimal::from(12),
                close - range * k / Decimal::from(6),
                close - range * k / Decimal::from(4),
            )
        }
        "fibonacci" => {
            let p = (high + low + close) / Decimal::from(3);
            let range = high - low;
            (
                p,
                p + range * Decimal::new(382, 3),
                p + range * Decimal::new(618, 3),
                p + range,
                p - range * Decimal::new(382, 3),
                p - range * Decimal::new(618, 3),
                p - range,
            )
        }
        // classic (default)
        _ => {
            let p = (high + low + close) / Decimal::from(3);
            (
                p,
                p * Decimal::TWO - low,
                p + (high - low),
                high + (p - low) * Decimal::TWO,
                p * Decimal::TWO - high,
                p - (high - low),
                low - (high - p) * Decimal::TWO,
            )
        }
    }
}

/// UTC calendar-day bucket of a millisecond timestamp as a Decimal.
/// Two timestamps share a `getUTCDate()` change boundary iff their epoch-day
/// buckets differ (UTC has no DST), so this matches the reference's session
/// reset logic.
fn utc_day_bucket(t_ms: Decimal) -> Decimal {
    (t_ms / Decimal::from(86_400_000u64)).floor()
}

fn dec_from_f64(x: f64) -> Decimal {
    Decimal::from_str(&x.to_string()).unwrap_or(Decimal::ZERO)
}

/// Linearly weighted average of a window (oldest weight 1, newest weight n).
/// Accepts anything that yields `&Decimal` in order — slices and `VecDeque`s.
fn wma_of<'a>(window: impl IntoIterator<Item = &'a Decimal>) -> Decimal {    let mut n: usize = 0;
    let mut weights_sum: usize = 0;
    let mut acc = Decimal::ZERO;
    for (i, p) in window.into_iter().enumerate() {
        acc += *p * Decimal::from(i + 1);
        n += 1;
        weights_sum += i + 1;
    }
    if n == 0 {
        return Decimal::ZERO;
    }
    acc / Decimal::from(weights_sum)
}

/// Simple average over an iterator of `&Decimal`.
fn sma_of<'a>(vals: impl IntoIterator<Item = &'a Decimal>) -> Decimal {
    let mut sum = Decimal::ZERO;
    let mut n: usize = 0;
    for v in vals {
        sum += *v;
        n += 1;
    }
    if n == 0 {
        Decimal::ZERO
    } else {
        sum / Decimal::from(n)
    }
}

#[wasm_bindgen]
pub struct TechnicalsCalculator {
    settings: IndicatorSettings,

    // Global Price History Buffers (Shared Memory)
    // Max 200 candles for all indicators
    price_history_closes: VecDeque<Decimal>,
    price_history_highs: VecDeque<Decimal>,
    price_history_lows: VecDeque<Decimal>,
    price_history_volumes: VecDeque<Decimal>,
    max_history_size: usize,

    ema_states: HashMap<usize, EmaState>,
    sma_states: HashMap<usize, SmaState>,
    wma_states: HashMap<usize, WmaState>,
    vwma_states: HashMap<usize, VwmaState>,
    hma_states: HashMap<usize, HmaState>,
    rsi_states: HashMap<usize, RsiState>,
    macd_states: HashMap<String, MacdState>,
    bb_states: HashMap<usize, BbState>,
    atr_states: HashMap<usize, AtrState>,
    stoch_states: HashMap<String, StochState>,
    mom_states: HashMap<usize, MomState>,
    wr_states: HashMap<usize, WrState>,
    volma_states: HashMap<usize, VolMaState>,
    #[allow(dead_code)]
    cci_states: HashMap<usize, CciState>,
    #[allow(dead_code)]
    adx_states: HashMap<usize, AdxState>,
    st_states: HashMap<String, SuperTrendState>,
    #[allow(dead_code)]
    chop_states: HashMap<usize, ChopState>,
    mfi_states: HashMap<usize, MfiState>,
    vwap_states: HashMap<String, VwapState>,
    psar_states: HashMap<String, PsarState>,
    pivots_state: PivotState,
}

#[wasm_bindgen]
impl TechnicalsCalculator {
    #[wasm_bindgen(constructor)]
    pub fn new() -> TechnicalsCalculator {
        TechnicalsCalculator {
            settings: IndicatorSettings::default(),

            // Initialize global price history buffers (max 200 candles)
            price_history_closes: VecDeque::with_capacity(200),
            price_history_highs: VecDeque::with_capacity(200),
            price_history_lows: VecDeque::with_capacity(200),
            price_history_volumes: VecDeque::with_capacity(200),
            max_history_size: 200,

            ema_states: HashMap::new(),
            sma_states: HashMap::new(),
            wma_states: HashMap::new(),
            vwma_states: HashMap::new(),
            hma_states: HashMap::new(),
            rsi_states: HashMap::new(),
            macd_states: HashMap::new(),
            bb_states: HashMap::new(),
            atr_states: HashMap::new(),
            stoch_states: HashMap::new(),
            mom_states: HashMap::new(),
            wr_states: HashMap::new(),
            volma_states: HashMap::new(),
            cci_states: HashMap::new(),
            adx_states: HashMap::new(),
            st_states: HashMap::new(),
            chop_states: HashMap::new(),
            mfi_states: HashMap::new(),
            vwap_states: HashMap::new(),
            psar_states: HashMap::new(),
            pivots_state: PivotState::default(),
        }
    }

    /// Seed the calculator with price history.
    ///
    /// Prices and volumes cross the boundary as decimal strings, not `f64`:
    /// widening a `f64` to `Decimal` on this side cannot recover precision that
    /// was already lost on the way in, which is the whole point of BUG-0182.
    /// `_times` stays numeric — it is a millisecond timestamp, not a financial
    /// value, and is currently unused.
    pub fn initialize(
        &mut self,
        closes_arr: Vec<String>,
        highs_arr: Vec<String>,
        lows_arr: Vec<String>,
        volumes_arr: Vec<String>,
        times: &[f64],
        settings_json: &str,
    ) {
        let closes: Vec<Decimal> = parse_decimals(&closes_arr);
        let highs: Vec<Decimal> = parse_decimals(&highs_arr);
        let lows: Vec<Decimal> = parse_decimals(&lows_arr);
        let volumes: Vec<Decimal> = parse_decimals(&volumes_arr);

        self.settings = serde_json::from_str(settings_json).unwrap_or_default();
        self.settings.drop_unusable_periods();
        let len = closes.len();
        if len == 0 {
            return;
        }

        // Initialize global price history buffers
        // Store last N candles (max 200)
        let start_idx = if len > self.max_history_size {
            len - self.max_history_size
        } else {
            0
        };
        for i in start_idx..len {
            self.price_history_closes.push_back(closes[i]);
            self.price_history_highs.push_back(highs[i]);
            self.price_history_lows.push_back(lows[i]);
            self.price_history_volumes.push_back(volumes[i]);
        }

        // --- Core Init (Condensed) ---
        for s in &self.settings.ema {
            let k = Decimal::TWO / (Decimal::from(s.length) + Decimal::ONE);
            let mut val = closes[0];
            let mut init = false;
            if len >= s.length {
                val = closes[0..s.length].iter().sum::<Decimal>() / Decimal::from(s.length);
                for &p in &closes[s.length..] {
                    val = (p - val) * k + val;
                }
                init = true;
            }
            self.ema_states.insert(
                s.length,
                EmaState {
                    k,
                    value: val,
                    initialized: init,
                },
            );
        }

        // SMA Init
        for s in &self.settings.sma {
            let mut sum = Decimal::ZERO;
            let mut init = false;
            if len >= s.length {
                for &p in &closes[len - s.length..] {
                    sum += p;
                }
                init = true;
            }
            self.sma_states.insert(
                s.length,
                SmaState {
                    sum,
                    initialized: init,
                },
            );
        }

        // WMA Init (Weighted Moving Average)
        for s in &self.settings.wma {
            let mut weighted_sum = Decimal::ZERO;
            let mut price_sum = Decimal::ZERO;
            let mut init = false;
            if len >= s.length {
                for i in 0..s.length {
                    let p = closes[len - s.length + i];
                    weighted_sum += p * Decimal::from(i + 1);
                    price_sum += p;
                }
                init = true;
            }
            self.wma_states.insert(
                s.length,
                WmaState {
                    weighted_sum,
                    price_sum,
                    initialized: init,
                },
            );
        }

        // VWMA Init (Volume-Weighted Moving Average)
        for s in &self.settings.vwma {
            let mut sum_pv = Decimal::ZERO;
            let mut sum_vol = Decimal::ZERO;
            let mut init = false;
            if len >= s.length {
                for i in (len - s.length)..len {
                    sum_pv += closes[i] * volumes[i];
                    sum_vol += volumes[i];
                }
                init = true;
            }
            self.vwma_states.insert(
                s.length,
                VwmaState {
                    sum_pv,
                    sum_vol,
                    initialized: init,
                },
            );
        }

        // HMA Init (Hull Moving Average) - WMA(2*WMA(n/2) - WMA(n), sqrt(n))
        // Full chain, mirroring JSIndicators.hma: the raw hull series is
        // replayed over history and smoothed by a WMA over the last
        // sqrt(n) raw values.
        for s in &self.settings.hma {
            let half_len = s.length / 2;
            let sqrt_len = (s.length as f64).sqrt() as usize;
            let mut sqrt_buf: VecDeque<Decimal> = VecDeque::new();
            let mut init = false;

            if s.length >= 2 && half_len >= 1 && len >= s.length + sqrt_len.saturating_sub(1) {
                // Replay: recompute both windowed WMAs per bar. O(len · n)
                // with n ≤ max_history_size — acceptable at init time.
                for i in (s.length - 1)..len {
                    let end = i + 1;
                    let wh = wma_of(&closes[end - half_len..end]);
                    let wf = wma_of(&closes[end - s.length..end]);
                    sqrt_buf.push_back(wh * Decimal::TWO - wf);
                    if sqrt_buf.len() > sqrt_len {
                        sqrt_buf.pop_front();
                    }
                }
                init = true;
            }
            let _sqrt_wma = wma_of(&sqrt_buf);
            self.hma_states.insert(
                s.length,
                HmaState {
                    wma_half: Decimal::ZERO,
                    wma_full: Decimal::ZERO,
                    _sqrt_wma,
                    sqrt_buf,
                    half_len,
                    sqrt_len,
                    initialized: init,
                },
            );
        }

        for s in &self.settings.rsi {
            let mut avg_gain = Decimal::ZERO;
            let mut avg_loss = Decimal::ZERO;
            let mut prev = closes[0];
            let mut init = false;
            if len > s.length {
                for i in 1..=s.length {
                    let chg = closes[i] - closes[i - 1];
                    if chg > Decimal::ZERO {
                        avg_gain += chg;
                    } else {
                        avg_loss -= chg;
                    }
                }
                avg_gain /= Decimal::from(s.length);
                avg_loss /= Decimal::from(s.length);
                for i in (s.length + 1)..len {
                    let chg = closes[i] - closes[i - 1];
                    let g = if chg > Decimal::ZERO {
                        chg
                    } else {
                        Decimal::ZERO
                    };
                    let l = if chg < Decimal::ZERO {
                        -chg
                    } else {
                        Decimal::ZERO
                    };
                    avg_gain = (avg_gain * (Decimal::from(s.length) - Decimal::ONE) + g)
                        / Decimal::from(s.length);
                    avg_loss = (avg_loss * (Decimal::from(s.length) - Decimal::ONE) + l)
                        / Decimal::from(s.length);
                }
                prev = closes[len - 1];
                init = true;
            }
            self.rsi_states.insert(
                s.length,
                RsiState {
                    avg_gain,
                    avg_loss,
                    prev_close: prev,
                    initialized: init,
                },
            );
        }
        for s in &self.settings.macd {
            let k_f = Decimal::TWO / (Decimal::from(s.fast) + Decimal::ONE);
            let k_s = Decimal::TWO / (Decimal::from(s.slow) + Decimal::ONE);
            let k_sig = Decimal::TWO / (Decimal::from(s.signal) + Decimal::ONE);
            let mut init = false;
            let mut ef = Decimal::ZERO;
            let mut es = Decimal::ZERO;
            let mut sv = Decimal::ZERO;
            if len > s.slow + s.signal {
                ef = closes[0];
                es = closes[0];
                for &p in closes.iter() {
                    ef = (p - ef) * k_f + ef;
                    es = (p - es) * k_s + es;
                    sv = ((ef - es) - sv) * k_sig + sv;
                }
                init = true;
            }
            self.macd_states.insert(
                format!("{}-{}-{}", s.fast, s.slow, s.signal),
                MacdState {
                    ema_fast: ef,
                    ema_slow: es,
                    signal_val: sv,
                    k_fast: k_f,
                    k_slow: k_s,
                    k_signal: k_sig,
                    initialized: init,
                },
            );
        }
        for s in &self.settings.bb {
            let mut sum = Decimal::ZERO;
            let mut sum_sq = Decimal::ZERO;
            let mut init = false;
            if len >= s.length {
                for &p in &closes[len - s.length..] {
                    sum += p;
                    sum_sq += p * p;
                }
                init = true;
            }
            self.bb_states.insert(
                s.length,
                BbState {
                    sum,
                    sum_sq,
                    std_dev_mult: s.std_dev,
                    initialized: init,
                },
            );
        }
        for s in &self.settings.atr {
            let mut val = Decimal::ZERO;
            let mut init = false;
            if len > s.length {
                let mut tr_sum = Decimal::ZERO;
                for i in 1..=s.length {
                    let h = highs[i];
                    let l = lows[i];
                    let pc = closes[i - 1];
                    tr_sum += std::cmp::max(h - l, std::cmp::max((h - pc).abs(), (l - pc).abs()));
                }
                val = tr_sum / Decimal::from(s.length);
                for i in (s.length + 1)..len {
                    let h = highs[i];
                    let l = lows[i];
                    let pc = closes[i - 1];
                    val = (val * (Decimal::from(s.length) - Decimal::ONE)
                        + std::cmp::max(h - l, std::cmp::max((h - pc).abs(), (l - pc).abs())))
                        / Decimal::from(s.length);
                }
                init = true;
            }
            self.atr_states.insert(
                s.length,
                AtrState {
                    value: val,
                    prev_close: closes[len - 1],
                    initialized: init,
                },
            );
        }
        for s in &self.settings.stoch {
            let smooth = s.smooth.max(1);
            let mut raw_buf: VecDeque<Decimal> = VecDeque::new();
            let mut smoothed_buf: VecDeque<Decimal> = VecDeque::new();
            let mut init = false;
            let mut d_val = Decimal::ZERO;
            if len >= s.k + smooth {
                for i in 0..len {
                    if i >= s.k - 1 {
                        // Find MaxH and MinL over last K periods
                        let start = i + 1 - s.k;
                        let mut max_h = Decimal::MIN;
                        let mut min_l = Decimal::MAX;
                        for j in start..=i {
                            max_h = std::cmp::max(max_h, highs[j]);
                            min_l = std::cmp::min(min_l, lows[j]);
                        }

                        let k = if max_h == min_l {
                            dec!(50.0)
                        } else {
                            (closes[i] - min_l) / (max_h - min_l) * dec!(100.0)
                        };

                        raw_buf.push_back(k);
                        if raw_buf.len() > smooth {
                            raw_buf.pop_front();
                        }
                        // Reference applies SMA(kSmoothing) to raw K before
                        // emitting Stoch.K.
                        let smoothed =
                            sma_of(raw_buf.iter().rev().take(smooth));
                        smoothed_buf.push_back(smoothed);
                        if smoothed_buf.len() > s.d {
                            smoothed_buf.pop_front();
                        }
                        d_val = smoothed_buf.iter().sum::<Decimal>()
                            / Decimal::from(smoothed_buf.len().max(1));
                    }
                }
                init = true;
            }
            self.stoch_states.insert(
                format!("{}-{}-{}", s.k, s.d, s.smooth),
                StochState {
                    k_buffer: raw_buf,
                    smoothed_buf,
                    d_val,
                    k_len: s.k,
                    d_len: s.d,
                    smooth,
                    initialized: init,
                },
            );
        }

        // CCI Init
        for s in &self.settings.cci {
            let mut tp_buf = VecDeque::new();
            let mut init = false;
            let mut sum_tp = Decimal::ZERO;
            if len >= s.length {
                for i in 0..len {
                    let tp = (highs[i] + lows[i] + closes[i]) / dec!(3.0);
                    tp_buf.push_back(tp);
                    sum_tp += tp;
                    if tp_buf.len() > s.length {
                        sum_tp -= tp_buf.pop_front().unwrap();
                    }
                }
                init = true;
            }
            self.cci_states.insert(
                s.length,
                CciState {
                    tp_buffer: tp_buf,
                    sum_tp,
                    initialized: init,
                },
            );
        }

        // Advanced Init
        for s in &self.settings.mom {
            let init = len > s.length;
            self.mom_states
                .insert(s.length, MomState { initialized: init });
        }
        for s in &self.settings.volma {
            let mut sum = Decimal::ZERO;
            let mut init = false;
            if len >= s.length {
                for &v in &volumes[len - s.length..] {
                    sum += v;
                }
                init = true;
            }
            self.volma_states.insert(
                s.length,
                VolMaState {
                    sum,
                    initialized: init,
                },
            );
        }
        for s in &self.settings.wr {
            let init = len >= s.length;
            self.wr_states
                .insert(s.length, WrState { initialized: init });
        }

        // ADX Init
        for s in &self.settings.adx {
            // Simplified ADX Init: Needs at least 2*length? Standard ADX needs some history to stabilize.
            // Using standard Wilder's smoothing initialization.
            let mut tr_smooth = Decimal::ZERO;
            let mut pdm_smooth = Decimal::ZERO;
            let mut ndm_smooth = Decimal::ZERO;
            let mut dx_smooth = Decimal::ZERO;
            let mut init = false;
            let mut prev_h = highs[0];
            let mut prev_l = lows[0];
            let mut prev_c = closes[0];

            if len > s.length * 2 {
                // ADX needs more history
                // 1. Initial SMA for first Length periods
                let mut tr_sum = Decimal::ZERO;
                let mut pdm_sum = Decimal::ZERO;
                let mut ndm_sum = Decimal::ZERO;
                for i in 1..=s.length {
                    let h = highs[i];
                    let l = lows[i];
                    let pc = closes[i - 1];
                    let tr = std::cmp::max(h - l, std::cmp::max((h - pc).abs(), (l - pc).abs()));
                    let up = h - highs[i - 1];
                    let down = lows[i - 1] - l;
                    let pdm = if up > down && up > Decimal::ZERO {
                        up
                    } else {
                        Decimal::ZERO
                    };
                    let ndm = if down > up && down > Decimal::ZERO {
                        down
                    } else {
                        Decimal::ZERO
                    };
                    tr_sum += tr;
                    pdm_sum += pdm;
                    ndm_sum += ndm;
                }
                tr_smooth = tr_sum;
                pdm_smooth = pdm_sum;
                ndm_smooth = ndm_sum; // First value is sum (or average? Wilder says sum for first?)
                                      // Actually Wilder's usually starts with SMA.
                                      // Let's use Average.
                tr_smooth /= Decimal::from(s.length);
                pdm_smooth /= Decimal::from(s.length);
                ndm_smooth /= Decimal::from(s.length);

                // 2. Smoothing loop
                let _dx_sum = Decimal::ZERO;
                for i in (s.length + 1)..len {
                    let h = highs[i];
                    let l = lows[i];
                    let pc = closes[i - 1];
                    let tr = std::cmp::max(h - l, std::cmp::max((h - pc).abs(), (l - pc).abs()));
                    let up = h - highs[i - 1];
                    let down = lows[i - 1] - l;
                    let pdm = if up > down && up > Decimal::ZERO {
                        up
                    } else {
                        Decimal::ZERO
                    };
                    let ndm = if down > up && down > Decimal::ZERO {
                        down
                    } else {
                        Decimal::ZERO
                    };

                    tr_smooth = (tr_smooth * (Decimal::from(s.length) - Decimal::ONE) + tr)
                        / Decimal::from(s.length);
                    pdm_smooth = (pdm_smooth * (Decimal::from(s.length) - Decimal::ONE) + pdm)
                        / Decimal::from(s.length);
                    ndm_smooth = (ndm_smooth * (Decimal::from(s.length) - Decimal::ONE) + ndm)
                        / Decimal::from(s.length);

                    let pdi = dec!(100.0) * pdm_smooth / tr_smooth;
                    let ndi = dec!(100.0) * ndm_smooth / tr_smooth;
                    let di_sum = pdi + ndi;
                    let dx = if di_sum == Decimal::ZERO {
                        Decimal::ZERO
                    } else {
                        dec!(100.0) * (pdi - ndi).abs() / di_sum
                    };

                    // ADX Smoothing: ADX is EMA/RMA of DX? Usually RMA.
                    // But we need to accumulate DX to get first ADX.
                    // Let's just track ADX via smoothing: adx = (adx * (n-1) + dx) / n
                    if i == s.length * 2 - 1 {
                        dx_smooth = dx;
                    } else if i >= s.length * 2 {
                        dx_smooth = (dx_smooth * (Decimal::from(s.length) - Decimal::ONE) + dx)
                            / Decimal::from(s.length);
                    }
                }
                init = true;
                prev_h = highs[len - 1];
                prev_l = lows[len - 1];
                prev_c = closes[len - 1];
            }
            self.adx_states.insert(
                s.length,
                AdxState {
                    tr_smooth,
                    pdm_smooth,
                    ndm_smooth,
                    dx_smooth,
                    prev_high: prev_h,
                    prev_low: prev_l,
                    prev_close: prev_c,
                    initialized: init,
                },
            );
        }

        // SuperTrend Init
        for s in &self.settings.supertrend {
            let _tr_val = Decimal::ZERO;
            let mut atr = Decimal::ZERO;
            let mut upper = Decimal::ZERO;
            let mut lower = Decimal::ZERO;
            let mut final_upper;
            let mut final_lower;
            let mut trend = 1;
            let mut init = false;

            if len > s.length {
                // 1. Calculate initial ATR over first 'length' candles
                let mut tr_sum = Decimal::ZERO;
                for i in 1..=s.length {
                    let h = highs[i];
                    let l = lows[i];
                    let pc = closes[i - 1];
                    let tr = std::cmp::max(h - l, std::cmp::max((h - pc).abs(), (l - pc).abs()));
                    tr_sum += tr;
                }
                atr = tr_sum / Decimal::from(s.length);

                // Initial Bands
                let h = highs[s.length];
                let l = lows[s.length];
                let basic_upper = (h + l) / Decimal::TWO + s.multiplier * atr;
                let basic_lower = (h + l) / Decimal::TWO - s.multiplier * atr;
                final_upper = basic_upper;
                final_lower = basic_lower;

                // 2. Replay history to establish trend
                for i in (s.length + 1)..len {
                    let h = highs[i];
                    let l = lows[i];
                    let c = closes[i];
                    let pc = closes[i - 1];
                    let tr = std::cmp::max(h - l, std::cmp::max((h - pc).abs(), (l - pc).abs()));

                    // RMA for ATR in SuperTrend? Or SMA? TradingView uses RMA.
                    atr = (atr * (Decimal::from(s.length) - Decimal::ONE) + tr)
                        / Decimal::from(s.length);

                    let basic_upper = (h + l) / Decimal::TWO + s.multiplier * atr;
                    let basic_lower = (h + l) / Decimal::TWO - s.multiplier * atr;

                    if basic_upper < final_upper || pc > final_upper {
                        final_upper = basic_upper;
                    }
                    if basic_lower > final_lower || pc < final_lower {
                        final_lower = basic_lower;
                    }

                    let prev_trend = trend;
                    if prev_trend == 1 {
                        if c < final_lower {
                            trend = -1;
                        }
                    } else {
                        if c > final_upper {
                            trend = 1;
                        }
                    }
                }
                upper = final_upper;
                lower = final_lower;
                init = true;
            }
            self.st_states.insert(
                format!("{}-{}", s.length, s.multiplier),
                SuperTrendState {
                    atr,
                    upper,
                    lower,
                    trend,
                    prev_close: closes[len - 1],
                    initialized: init,
                    multiplier: s.multiplier,
                },
            );
        }

        // Chop Init
        for s in &self.settings.chop {
            let mut tr_buffer = VecDeque::new();
            let mut high_buffer = VecDeque::new(); // Store recent highs
            let mut low_buffer = VecDeque::new(); // Store recent lows
            let mut sum_tr = Decimal::ZERO;
            let mut init = false;

            if len > s.length {
                // Pre-fill buffers
                let start_idx = len - s.length;
                for i in start_idx..len {
                    let h = highs[i];
                    let l = lows[i];
                    let pc = closes[i - 1];
                    let tr = std::cmp::max(h - l, std::cmp::max((h - pc).abs(), (l - pc).abs()));
                    tr_buffer.push_back(tr);
                    sum_tr += tr;
                    high_buffer.push_back(h);
                    low_buffer.push_back(l);
                }
                init = true;
            }
            self.chop_states.insert(
                s.length,
                ChopState {
                    highs: high_buffer,
                    lows: low_buffer,
                    tr_buffer,
                    sum_tr,
                    prev_close: closes[len - 1],
                    initialized: init,
                },
            );
        }

        // MFI Init — replay typical-price money flows over history so the
        // rolling buffers in update()/shift() start warm (FEAT-0316).
        for s in &self.settings.mfi {
            let mut pos_buf: VecDeque<Decimal> = VecDeque::new();
            let mut neg_buf: VecDeque<Decimal> = VecDeque::new();
            let mut sum_p = Decimal::ZERO;
            let mut sum_n = Decimal::ZERO;
            let mut prev_tp = (highs[0] + lows[0] + closes[0]) / dec!(3.0);
            let mut init = false;

            if len >= s.length + 1 {
                for i in 1..len {
                    let tp = (highs[i] + lows[i] + closes[i]) / dec!(3.0);
                    let rmf = tp * volumes[i];
                    let (p, n) = if tp > prev_tp {
                        (rmf, Decimal::ZERO)
                    } else if tp < prev_tp {
                        (Decimal::ZERO, rmf)
                    } else {
                        (Decimal::ZERO, Decimal::ZERO)
                    };

                    pos_buf.push_back(p);
                    sum_p += p;
                    if pos_buf.len() > s.length {
                        sum_p -= pos_buf.pop_front().unwrap();
                    }
                    neg_buf.push_back(n);
                    sum_n += n;
                    if neg_buf.len() > s.length {
                        sum_n -= neg_buf.pop_front().unwrap();
                    }
                    prev_tp = tp;
                }
                init = true;
            }
            self.mfi_states.insert(
                s.length,
                MfiState {
                    pos_flow: pos_buf,
                    neg_flow: neg_buf,
                    sum_p,
                    sum_n,
                    prev_tp,
                    initialized: init,
                },
            );
        }

        // VWAP Init — seed the cumulative sums from history, honouring the
        // session reset on UTC-day boundaries like JSIndicators.vwap.
        for s in &self.settings.vwap {
            let session = s.anchor == "session";
            let mut cum_pv = Decimal::ZERO;
            let mut cum_vol = Decimal::ZERO;
            let mut last_day: Option<Decimal> = None;

            for i in 0..len {
                let t = times.get(i).copied().unwrap_or(0.0);
                let day = utc_day_bucket(dec_from_f64(t));
                if session {
                    if let Some(prev_day) = last_day {
                        if day != prev_day {
                            cum_pv = Decimal::ZERO;
                            cum_vol = Decimal::ZERO;
                        }
                    }
                    last_day = Some(day);
                }
                let tp = (highs[i] + lows[i] + closes[i]) / dec!(3.0);
                cum_pv += tp * volumes[i];
                cum_vol += volumes[i];
            }
            self.vwap_states.insert(
                s.anchor.clone(),
                VwapState {
                    cum_vol,
                    cum_pv,
                    last_t: times
                        .last()
                        .map(|t| dec_from_f64(*t))
                        .unwrap_or(Decimal::ZERO),
                },
            );
        }

        // PSAR Init — replay the exact reference state machine over history.
        for s in &self.settings.psar {
            if len < 2 {
                continue;
            }
            let mut st = PsarState {
                sar: lows[0],
                ep: highs[0],
                af: s.start,
                is_long: true,
                max_af: s.max,
                inc_af: s.start,
                prev_high: Decimal::ZERO,
                prev_low: Decimal::ZERO,
                prev2_high: Decimal::ZERO,
                prev2_low: Decimal::ZERO,
                initialized: false,
            };
            for i in 1..len {
                let apply_second_clamp = i >= 2;
                (st, _) = psar_step(
                    st,
                    highs[i],
                    lows[i],
                    highs[i - 1],
                    lows[i - 1],
                    apply_second_clamp,
                    if apply_second_clamp { highs[i - 2] } else { Decimal::ZERO },
                    if apply_second_clamp { lows[i - 2] } else { Decimal::ZERO },
                );
            }
            st.prev_high = highs[len - 1];
            st.prev_low = lows[len - 1];
            st.prev2_high = highs[len - 2];
            st.prev2_low = lows[len - 2];
            st.initialized = true;
            self.psar_states.insert("psar".to_string(), st);
        }

        // Pivots Init — the reference computes levels from the candle BEFORE
        // the latest one. With the initialize/update split, the last
        // initialize candle IS that "previous" candle once update() runs.
        if let Some(ps) = self.settings.pivots.first() {
            if len >= 1 {
                let (p, r1, r2, r3, s1, s2, s3) =
                    compute_pivot_levels(&ps.type_, highs[len - 1], lows[len - 1], closes[len - 1]);
                self.pivots_state = PivotState {
                    p,
                    r1,
                    r2,
                    r3,
                    s1,
                    s2,
                    s3,
                    basis_h: highs[len - 1],
                    basis_l: lows[len - 1],
                    basis_c: closes[len - 1],
                    basis_o: Decimal::ZERO,
                    initialized: true,
                };
            }
        }
    }

    pub fn update(
        &self,
        _o_str: String,
        h_str: String,
        l_str: String,
        c_str: String,
        v_str: String,
        _t_str: String,
    ) -> String {
        let h = Decimal::from_str(&h_str).unwrap_or(Decimal::ZERO);
        let l = Decimal::from_str(&l_str).unwrap_or(Decimal::ZERO);
        let c = Decimal::from_str(&c_str).unwrap_or(Decimal::ZERO);
        let v = Decimal::from_str(&v_str).unwrap_or(Decimal::ZERO);
        let mut out = OutputData {
            moving_averages: HashMap::new(),
            oscillators: HashMap::new(),
            volatility: HashMap::new(),
            pivots: HashMap::new(),
        };

        // ... Core Updates ...
        for (len, s) in &self.ema_states {
            if s.initialized {
                out.moving_averages
                    .insert(format!("EMA{}", len), (c - s.value) * s.k + s.value);
            }
        }

        // SMA Update
        for (len, s) in &self.sma_states {
            if s.initialized && self.price_history_closes.len() >= *len {
                let old = self.price_history_closes[self.price_history_closes.len() - *len];
                out.moving_averages.insert(
                    format!("SMA{}", len),
                    (s.sum - old + c) / Decimal::from(*len),
                );
            }
        }

        // WMA Update
        for (len, s) in &self.wma_states {
            if s.initialized {
                let weights_sum = (*len * (*len + 1)) / 2;
                let wma = (s.weighted_sum - s.price_sum + (Decimal::from(*len) * c))
                    / Decimal::from(weights_sum);
                out.moving_averages.insert(format!("WMA{}", len), wma);
            }
        }

        // VWMA Update
        for (len, s) in &self.vwma_states {
            if s.initialized
                && self.price_history_closes.len() >= *len
                && self.price_history_volumes.len() >= *len
            {
                let old_close = self.price_history_closes[self.price_history_closes.len() - *len];
                let old_vol = self.price_history_volumes[self.price_history_volumes.len() - *len];
                let new_sum_pv = s.sum_pv - (old_close * old_vol) + (c * v);
                let new_sum_vol = s.sum_vol - old_vol + v;
                out.moving_averages.insert(
                    format!("VWMA{}", len),
                    if new_sum_vol != Decimal::ZERO {
                        new_sum_pv / new_sum_vol
                    } else {
                        Decimal::ZERO
                    },
                );
            }
        }

        // HMA Update
        // HMA Update — proper chain WMA(2·WMA(n/2) − WMA(n), sqrt(n)),
        // computed prospectively so the incoming candle is included
        // without being committed to state yet (FEAT-0316).
        for (len, s) in &self.hma_states {
            if !s.initialized || s.half_len == 0 || s.sqrt_len == 0 {
                continue;
            }
            let hist = &self.price_history_closes;
            let n = hist.len();
            if n + 1 < *len {
                continue;
            }
            let window_with_current = |take: usize| -> Vec<Decimal> {
                let need = take.saturating_sub(1);
                let mut v: Vec<Decimal> = Vec::with_capacity(take);
                if need > 0 {
                    v.extend(hist.iter().skip(n - need));
                }
                v.push(c);
                v
            };
            let half_window = window_with_current(s.half_len.max(1));
            let full_window = window_with_current(*len);
            let raw = wma_of(&half_window) * Decimal::TWO - wma_of(&full_window);

            let mut buf = s.sqrt_buf.clone();
            if buf.len() >= s.sqrt_len {
                buf.pop_front();
            }
            buf.push_back(raw);
            out.moving_averages.insert(format!("HMA{}", len), wma_of(&buf));
        }

        for (len, s) in &self.rsi_states {
            if s.initialized {
                let chg = c - s.prev_close;
                let g = if chg > Decimal::ZERO {
                    chg
                } else {
                    Decimal::ZERO
                };
                let l_ = if chg < Decimal::ZERO {
                    -chg
                } else {
                    Decimal::ZERO
                };
                let ag =
                    (s.avg_gain * (Decimal::from(*len) - Decimal::ONE) + g) / Decimal::from(*len);
                let al =
                    (s.avg_loss * (Decimal::from(*len) - Decimal::ONE) + l_) / Decimal::from(*len);
                // Mirror the reference exactly: an all-gains window is RSI 100,
                // not ~99.01 via rs=100 (BUG-0315).
                let rsi_val = if al == Decimal::ZERO {
                    dec!(100.0)
                } else {
                    let rs = ag / al;
                    dec!(100.0) - (dec!(100.0) / (Decimal::ONE + rs))
                };
                out.oscillators.insert(format!("RSI{}", len), rsi_val);
            }
        }
        for (k, s) in &self.macd_states {
            if s.initialized {
                let f = (c - s.ema_fast) * s.k_fast + s.ema_fast;
                let sl = (c - s.ema_slow) * s.k_slow + s.ema_slow;
                let m = f - sl;
                let sig = (m - s.signal_val) * s.k_signal + s.signal_val;
                out.oscillators.insert(format!("{}.macd", k), m);
                out.oscillators.insert(format!("{}.signal", k), sig);
                out.oscillators.insert(format!("{}.histogram", k), m - sig);
            }
        }
        for (len, s) in &self.bb_states {
            if s.initialized && self.price_history_closes.len() >= *len {
                let old = self.price_history_closes[self.price_history_closes.len() - *len];
                let ns = s.sum - old + c;
                let nsq = s.sum_sq - (old * old) + (c * c);
                let sma = ns / Decimal::from(*len);
                let sd = if (nsq - (ns * ns) / Decimal::from(*len)) / Decimal::from(*len)
                    > Decimal::ZERO
                {
                    ((nsq - (ns * ns) / Decimal::from(*len)) / Decimal::from(*len))
                        .sqrt()
                        .unwrap_or(Decimal::ZERO)
                } else {
                    Decimal::ZERO
                };
                out.volatility
                    .insert(format!("BB{}_upper", len), sma + s.std_dev_mult * sd);
                out.volatility
                    .insert(format!("BB{}_lower", len), sma - s.std_dev_mult * sd);
                out.volatility.insert(format!("BB{}_basis", len), sma);
            }
        }
        for (len, s) in &self.atr_states {
            if s.initialized {
                let tr = std::cmp::max(
                    h - l,
                    std::cmp::max((h - s.prev_close).abs(), (l - s.prev_close).abs()),
                );
                out.volatility.insert(
                    format!("ATR{}", len),
                    (s.value * (Decimal::from(*len) - Decimal::ONE) + tr) / Decimal::from(*len),
                );
            }
        }
        for (key, s) in &self.stoch_states {
            if s.initialized && self.price_history_highs.len() + 1 >= s.k_len {
                let hist_h = &self.price_history_highs;
                let hist_l = &self.price_history_lows;
                let n = hist_h.len();
                // Prospective raw %K over the last k_len-1 committed bars
                // plus the incoming candle.
                let start = (n + 1).saturating_sub(s.k_len);
                let mut max_h = h;
                let mut min_l = l;
                for i in start..n {
                    max_h = std::cmp::max(max_h, hist_h[i]);
                    min_l = std::cmp::min(min_l, hist_l[i]);
                }
                let k = if max_h == min_l {
                    dec!(50.0)
                } else {
                    (c - min_l) / (max_h - min_l) * dec!(100.0)
                };

                // Smooth the candidate against the last (smooth-1) committed
                // raw values — mirrors SMA(kSmoothing) on the raw series.
                let smoothed = sma_of(
                    s.k_buffer
                        .iter()
                        .rev()
                        .take(s.smooth.saturating_sub(1))
                        .chain(std::iter::once(&k)),
                );

                // D is the SMA of the smoothed series including the candidate.
                let d = sma_of(
                    s.smoothed_buf
                        .iter()
                        .rev()
                        .take(s.d_len.saturating_sub(1))
                        .chain(std::iter::once(&smoothed)),
                );
                out.oscillators.insert(format!("STOCH_{}.d", key), d);
                out.oscillators.insert(format!("STOCH_{}.k", key), smoothed);
            }
        }

        // CCI Update
        for (len, s) in &self.cci_states {
            if s.initialized && s.tp_buffer.len() >= *len {
                let tp = (h + l + c) / dec!(3.0);
                let sum = s.sum_tp - s.tp_buffer.front().unwrap() + tp;
                let sma = sum / Decimal::from(*len);

                let mut mean_dev = Decimal::ZERO;
                // Iterate buffer skipping first, adding current
                for i in 1..s.tp_buffer.len() {
                    mean_dev += (s.tp_buffer[i] - sma).abs();
                }
                mean_dev += (tp - sma).abs();
                mean_dev /= Decimal::from(*len);

                let cci = if mean_dev == Decimal::ZERO {
                    Decimal::ZERO
                } else {
                    (tp - sma) / (dec!(0.015) * mean_dev)
                };
                out.oscillators.insert(format!("CCI{}", len), cci);
            }
        }

        // Advanced Updates
        for (len, s) in &self.mom_states {
            if s.initialized && self.price_history_closes.len() >= *len + 1 {
                let old = self.price_history_closes[self.price_history_closes.len() - *len - 1];
                out.oscillators.insert(format!("MOM{}", len), c - old);
            }
        }
        for (len, s) in &self.volma_states {
            if s.initialized && self.price_history_volumes.len() >= *len {
                let old = self.price_history_volumes[self.price_history_volumes.len() - *len];
                out.moving_averages.insert(
                    format!("VolMa{}", len),
                    (s.sum - old + v) / Decimal::from(*len),
                );
            }
        }
        for (len, s) in &self.wr_states {
            if s.initialized && self.price_history_highs.len() >= *len {
                let start = self.price_history_highs.len() - *len;
                let mut max_h = h;
                let mut min_l = l;
                for i in start..self.price_history_highs.len() {
                    max_h = std::cmp::max(max_h, self.price_history_highs[i]);
                    min_l = std::cmp::min(min_l, self.price_history_lows[i]);
                }
                out.oscillators.insert(
                    format!("WR{}", len),
                    if max_h == min_l {
                        -dec!(50.0)
                    } else {
                        (max_h - c) / (max_h - min_l) * -dec!(100.0)
                    },
                );
            }
        }

        // ADX Update
        for (len, s) in &self.adx_states {
            if s.initialized {
                let h_curr = h;
                let l_curr = l;
                let c_prev = s.prev_close;
                let tr = std::cmp::max(
                    h_curr - l_curr,
                    std::cmp::max((h_curr - c_prev).abs(), (l_curr - c_prev).abs()),
                );
                let up = h_curr - s.prev_high;
                let down = s.prev_low - l_curr;
                let pdm = if up > down && up > Decimal::ZERO {
                    up
                } else {
                    Decimal::ZERO
                };
                let ndm = if down > up && down > Decimal::ZERO {
                    down
                } else {
                    Decimal::ZERO
                };

                // Calculate temporary smoothed values (don't update state)
                let tr_smooth =
                    (s.tr_smooth * (Decimal::from(*len) - Decimal::ONE) + tr) / Decimal::from(*len);
                let pdm_smooth = (s.pdm_smooth * (Decimal::from(*len) - Decimal::ONE) + pdm)
                    / Decimal::from(*len);
                let ndm_smooth = (s.ndm_smooth * (Decimal::from(*len) - Decimal::ONE) + ndm)
                    / Decimal::from(*len);

                let pdi = if tr_smooth == Decimal::ZERO {
                    Decimal::ZERO
                } else {
                    dec!(100.0) * pdm_smooth / tr_smooth
                };
                let ndi = if tr_smooth == Decimal::ZERO {
                    Decimal::ZERO
                } else {
                    dec!(100.0) * ndm_smooth / tr_smooth
                };
                let di_sum = pdi + ndi;
                let dx = if di_sum == Decimal::ZERO {
                    Decimal::ZERO
                } else {
                    dec!(100.0) * (pdi - ndi).abs() / di_sum
                };

                // ADX Output (smoothed DX)
                let adx =
                    (s.dx_smooth * (Decimal::from(*len) - Decimal::ONE) + dx) / Decimal::from(*len);
                out.oscillators.insert(format!("ADX{}", len), adx);
                // Return individual DIs if needed? Usually ADX indicator returns ADX, +DI, -DI.
                out.oscillators.insert(format!("ADX{}_plus", len), pdi);
                out.oscillators.insert(format!("ADX{}_minus", len), ndi);
            }
        }

        // SuperTrend Update
        // SuperTrend Update
        for (key, s) in &self.st_states {
            if s.initialized {
                let parts: Vec<&str> = key.split('-').collect();
                let len: usize = parts[0].parse().unwrap_or(10);
                let mult = s.multiplier;

                let tr = std::cmp::max(
                    h - l,
                    std::cmp::max((h - s.prev_close).abs(), (l - s.prev_close).abs()),
                );
                // RMA Smoothed ATR
                let atr = (s.atr * (Decimal::from(len) - Decimal::ONE) + tr) / Decimal::from(len);

                let basic_upper = (h + l) / Decimal::TWO + mult * atr;
                let basic_lower = (h + l) / Decimal::TWO - mult * atr;

                // Band consolidation must mirror the initialize() replay:
                // tighten to basic while it stays on the trend side, reset to
                // basic when the close broke through the old band. The previous
                // branches were inverted, letting bands widen forever and
                // diverging streaming from batch state (found by the streaming
                // equivalence test).
                let final_upper = if basic_upper < s.upper || s.prev_close > s.upper {
                    basic_upper
                } else {
                    s.upper
                };
                let final_lower = if basic_lower > s.lower || s.prev_close < s.lower {
                    basic_lower
                } else {
                    s.lower
                };

                let mut trend = s.trend;
                if trend == 1 {
                    if c < final_lower {
                        trend = -1;
                    }
                } else {
                    if c > final_upper {
                        trend = 1;
                    }
                }

                out.volatility
                    .insert(format!("SuperTrend_{}", key), Decimal::from(trend));
                out.volatility
                    .insert(format!("SuperTrend_{}_upper", key), final_upper);
                out.volatility
                    .insert(format!("SuperTrend_{}_lower", key), final_lower);
            }
        }

        // Chop Update
        for (len, s) in &self.chop_states {
            if s.initialized && s.tr_buffer.len() >= *len {
                let tr = std::cmp::max(
                    h - l,
                    std::cmp::max((h - s.prev_close).abs(), (l - s.prev_close).abs()),
                );
                let sum_tr = s.sum_tr - s.tr_buffer.front().unwrap() + tr;

                // Find Max High and Min Low (including current)
                let mut max_h = h;
                let mut min_l = l;
                for &val in &s.highs {
                    max_h = max_h.max(val);
                }
                for &val in &s.lows {
                    min_l = min_l.min(val);
                }

                let range = max_h - min_l;
                let chop = if range == Decimal::ZERO {
                    Decimal::ZERO
                } else {
                    safe_div(
                        dec!(100.0) * safe_log10(safe_div(sum_tr, range)),
                        safe_log10(Decimal::from(*len)),
                    )
                };
                out.volatility.insert(format!("CHOP{}", len), chop);
            }
        }

        // MFI Update
        for (len, s) in &self.mfi_states {
            if s.initialized && s.pos_flow.len() >= *len {
                let tp = (h + l + c) / dec!(3.0);
                let rmf = tp * v;
                let (p, n) = if tp > s.prev_tp {
                    (rmf, Decimal::ZERO)
                } else if tp < s.prev_tp {
                    (Decimal::ZERO, rmf)
                } else {
                    (Decimal::ZERO, Decimal::ZERO)
                };

                let sum_p = s.sum_p - s.pos_flow.front().unwrap_or(&Decimal::ZERO) + p;
                let sum_n = s.sum_n - s.neg_flow.front().unwrap_or(&Decimal::ZERO) + n;

                let mfi = if sum_n == Decimal::ZERO {
                    dec!(100.0)
                } else {
                    dec!(100.0) - (dec!(100.0) / (Decimal::ONE + sum_p / sum_n))
                };
                out.oscillators.insert(format!("MFI{}", len), mfi);
            }
        }

        // VWAP Update
        for (key, s) in &self.vwap_states {
            let tp = (h + l + c) / dec!(3.0);
            let mut cum_pv = s.cum_pv;
            let mut cum_vol = s.cum_vol;
            // Session reset on a UTC-day boundary, mirroring the reference.
            if key == "session" {
                let day = utc_day_bucket(Decimal::from_str(&_t_str).unwrap_or(Decimal::ZERO));
                let prev_day = utc_day_bucket(s.last_t);
                if !s.last_t.is_zero() && day != prev_day {
                    cum_pv = Decimal::ZERO;
                    cum_vol = Decimal::ZERO;
                }
            }
            cum_pv += tp * v;
            cum_vol += v;
            let vwap = if cum_vol == Decimal::ZERO {
                Decimal::ZERO
            } else {
                cum_pv / cum_vol
            };
            out.volatility.insert(format!("VWAP_{}", key), vwap);
        }

        // PSAR Update — one prospective step against the incoming candle;
        // the committed state advances in shift() (FEAT-0316).
        for (_, st) in &self.psar_states {
            if !st.initialized {
                continue;
            }
            let (_, sar_now) = psar_step(
                *st,
                h,
                l,
                st.prev_high,
                st.prev_low,
                true,
                st.prev2_high,
                st.prev2_low,
            );
            out.volatility.insert("PSAR".to_string(), sar_now);
        }

        // Pivots Update — levels from the stored previous-candle basis.
        if self.pivots_state.initialized {
            out.pivots.insert("P".to_string(), self.pivots_state.p);
            out.pivots.insert("R1".to_string(), self.pivots_state.r1);
            out.pivots.insert("R2".to_string(), self.pivots_state.r2);
            out.pivots.insert("R3".to_string(), self.pivots_state.r3);
            out.pivots.insert("S1".to_string(), self.pivots_state.s1);
            out.pivots.insert("S2".to_string(), self.pivots_state.s2);
            out.pivots.insert("S3".to_string(), self.pivots_state.s3);
        }

        serde_json::to_string(&out).unwrap_or(String::from("{}"))
    }

    pub fn shift(
        &mut self,
        _o_str: String,
        h_str: String,
        l_str: String,
        c_str: String,
        v_str: String,
        _t_str: String,
    ) {
        let mut popped_c = None;
        let mut popped_v = None;

        // Update global price history buffers
        if self.price_history_closes.len() >= self.max_history_size {
            popped_c = self.price_history_closes.pop_front();
            self.price_history_highs.pop_front();
            self.price_history_lows.pop_front();
            popped_v = self.price_history_volumes.pop_front();
        }
        let c = Decimal::from_str(&c_str).unwrap();
        self.price_history_closes.push_back(c);
        let h = Decimal::from_str(&h_str).unwrap();
        self.price_history_highs.push_back(h);
        let l = Decimal::from_str(&l_str).unwrap();
        self.price_history_lows.push_back(l);
        let v = Decimal::from_str(&v_str).unwrap();
        self.price_history_volumes.push_back(v);

        // ... Core Shifts ...
        for (_len, s) in &mut self.ema_states {
            if s.initialized {
                s.value = (c - s.value) * s.k + s.value;
            }
        }

        // SMA Shift
        for (len, s) in &mut self.sma_states {
            if s.initialized && self.price_history_closes.len() >= *len {
                let old_price = if self.price_history_closes.len() > *len {
                    self.price_history_closes[self.price_history_closes.len() - *len - 1]
                } else {
                    popped_c.unwrap_or(Decimal::ZERO)
                };
                s.sum = s.sum - old_price + c;
            }
        }

        // WMA Shift
        for (len, s) in &mut self.wma_states {
            if s.initialized && self.price_history_closes.len() >= *len {
                let old_price = if self.price_history_closes.len() > *len {
                    self.price_history_closes[self.price_history_closes.len() - *len - 1]
                } else {
                    popped_c.unwrap_or(Decimal::ZERO)
                };
                s.weighted_sum = s.weighted_sum - s.price_sum + (Decimal::from(*len) * c);
                s.price_sum = s.price_sum - old_price + c;
            }
        }

        // VWMA Shift
        for (len, s) in &mut self.vwma_states {
            if s.initialized
                && self.price_history_closes.len() >= *len
                && self.price_history_volumes.len() >= *len
            {
                let old_close = if self.price_history_closes.len() > *len {
                    self.price_history_closes[self.price_history_closes.len() - *len - 1]
                } else {
                    popped_c.unwrap_or(Decimal::ZERO)
                };
                let old_vol = if self.price_history_volumes.len() > *len {
                    self.price_history_volumes[self.price_history_volumes.len() - *len - 1]
                } else {
                    popped_v.unwrap_or(Decimal::ZERO)
                };
                s.sum_pv = s.sum_pv - (old_close * old_vol) + (c * v);
                s.sum_vol = s.sum_vol - old_vol + v;
            }
        }

        // HMA Shift (recalculate WMAs)
        for (len, s) in &mut self.hma_states {
            if s.initialized && self.price_history_closes.len() >= *len {
                let half = *len / 2;

                // Recalculate WMA(n/2)
                let weights_half = (half * (half + 1)) / 2;
                let mut wma_half = Decimal::ZERO;
                for i in 0..half {
                    let idx = self.price_history_closes.len() - half + i;
                    wma_half += self.price_history_closes[idx] * Decimal::from(i + 1);
                }
                s.wma_half = wma_half / Decimal::from(weights_half);

                // Recalculate WMA(n)
                let weights_full = (*len * (*len + 1)) / 2;
                let mut wma_full = Decimal::ZERO;
                for i in 0..*len {
                    let idx = self.price_history_closes.len() - *len + i;
                    wma_full += self.price_history_closes[idx] * Decimal::from(i + 1);
                }
                s.wma_full = wma_full / Decimal::from(weights_full);

                // Advance the raw hull series and its sqrt(n) smoothing so
                // state stays warm for the next update (FEAT-0316).
                let raw = s.wma_half * Decimal::TWO - s.wma_full;
                if s.sqrt_len > 0 {
                    s.sqrt_buf.push_back(raw);
                    if s.sqrt_buf.len() > s.sqrt_len {
                        s.sqrt_buf.pop_front();
                    }
                    s._sqrt_wma = wma_of(&s.sqrt_buf);
                }
            }
        }

        for (len, s) in &mut self.rsi_states {
            if s.initialized {
                let chg = c - s.prev_close;
                let g = if chg > Decimal::ZERO {
                    chg
                } else {
                    Decimal::ZERO
                };
                let l_ = if chg < Decimal::ZERO {
                    -chg
                } else {
                    Decimal::ZERO
                };
                s.avg_gain =
                    (s.avg_gain * (Decimal::from(*len) - Decimal::ONE) + g) / Decimal::from(*len);
                s.avg_loss =
                    (s.avg_loss * (Decimal::from(*len) - Decimal::ONE) + l_) / Decimal::from(*len);
                s.prev_close = c;
            }
        }
        for (_k, s) in &mut self.macd_states {
            if s.initialized {
                s.ema_fast = (c - s.ema_fast) * s.k_fast + s.ema_fast;
                s.ema_slow = (c - s.ema_slow) * s.k_slow + s.ema_slow;
                s.signal_val =
                    ((s.ema_fast - s.ema_slow) - s.signal_val) * s.k_signal + s.signal_val;
            }
        }
        for (len, s) in &mut self.bb_states {
            if s.initialized && self.price_history_closes.len() >= *len {
                let old_price = if self.price_history_closes.len() > *len {
                    self.price_history_closes[self.price_history_closes.len() - *len - 1]
                } else {
                    popped_c.unwrap_or(Decimal::ZERO)
                };
                s.sum = s.sum - old_price + c;
                s.sum_sq = s.sum_sq - (old_price * old_price) + (c * c);
            }
        }
        for (len, s) in &mut self.atr_states {
            if s.initialized {
                let tr = std::cmp::max(
                    h - l,
                    std::cmp::max((h - s.prev_close).abs(), (l - s.prev_close).abs()),
                );
                s.value =
                    (s.value * (Decimal::from(*len) - Decimal::ONE) + tr) / Decimal::from(*len);
                s.prev_close = c;
            }
        }
        for (_key, s) in &mut self.stoch_states {
            if s.initialized {
                // Find max_h/min_l over last K periods from global history
                // Global history now includes current h/l at the end
                let hist_len = self.price_history_highs.len();
                let start = if hist_len > s.k_len {
                    hist_len - s.k_len
                } else {
                    0
                };

                let mut max_h = Decimal::MIN;
                let mut min_l = Decimal::MAX;
                for i in start..hist_len {
                    max_h = std::cmp::max(max_h, self.price_history_highs[i]);
                    min_l = std::cmp::min(min_l, self.price_history_lows[i]);
                }
                let k = if max_h == min_l {
                    dec!(50.0)
                } else {
                    (c - min_l) / (max_h - min_l) * dec!(100.0)
                };

                s.k_buffer.push_back(k);
                if s.k_buffer.len() > s.smooth {
                    s.k_buffer.pop_front();
                }
                let smoothed =
                    sma_of(s.k_buffer.iter().rev().take(s.smooth));
                s.smoothed_buf.push_back(smoothed);
                if s.smoothed_buf.len() > s.d_len {
                    s.smoothed_buf.pop_front();
                }
                s.d_val = s.smoothed_buf.iter().sum::<Decimal>()
                    / Decimal::from(s.smoothed_buf.len().max(1));
            }
        }

        // CCI Shift
        for (len, s) in &mut self.cci_states {
            if s.initialized {
                let tp = (h + l + c) / dec!(3.0);
                s.tp_buffer.push_back(tp);
                s.sum_tp += tp;
                if s.tp_buffer.len() > *len {
                    s.sum_tp -= s.tp_buffer.pop_front().unwrap();
                }
            }
        }

        // Advanced Shifts
        for (_len, s) in &mut self.mom_states {
            if s.initialized {
                // Momentum no longer needs internal buffer, using global closes
            }
        }
        for (len, s) in &mut self.volma_states {
            if s.initialized && self.price_history_volumes.len() >= *len {
                let old_vol = if self.price_history_volumes.len() > *len {
                    self.price_history_volumes[self.price_history_volumes.len() - *len - 1]
                } else {
                    popped_v.unwrap_or(Decimal::ZERO)
                };
                s.sum = s.sum - old_vol + v;
            }
        }
        for (_len, s) in &mut self.wr_states {
            if s.initialized {
                // WR no longer needs internal buffer, using global highs/lows
            }
        }

        // ADX Shift
        for (len, s) in &mut self.adx_states {
            if s.initialized {
                let h_curr = h;
                let l_curr = l;
                let c_prev = s.prev_close;
                let tr = std::cmp::max(
                    h_curr - l_curr,
                    std::cmp::max((h_curr - c_prev).abs(), (l_curr - c_prev).abs()),
                );
                let up = h_curr - s.prev_high;
                let down = s.prev_low - l_curr;
                let pdm = if up > down && up > Decimal::ZERO {
                    up
                } else {
                    Decimal::ZERO
                };
                let ndm = if down > up && down > Decimal::ZERO {
                    down
                } else {
                    Decimal::ZERO
                };

                // Update state with permanent values
                s.tr_smooth =
                    (s.tr_smooth * (Decimal::from(*len) - Decimal::ONE) + tr) / Decimal::from(*len);
                s.pdm_smooth = (s.pdm_smooth * (Decimal::from(*len) - Decimal::ONE) + pdm)
                    / Decimal::from(*len);
                s.ndm_smooth = (s.ndm_smooth * (Decimal::from(*len) - Decimal::ONE) + ndm)
                    / Decimal::from(*len);

                let pdi = if s.tr_smooth == Decimal::ZERO {
                    Decimal::ZERO
                } else {
                    dec!(100.0) * s.pdm_smooth / s.tr_smooth
                };
                let ndi = if s.tr_smooth == Decimal::ZERO {
                    Decimal::ZERO
                } else {
                    dec!(100.0) * s.ndm_smooth / s.tr_smooth
                };
                let di_sum = pdi + ndi;
                let dx = if di_sum == Decimal::ZERO {
                    Decimal::ZERO
                } else {
                    dec!(100.0) * (pdi - ndi).abs() / di_sum
                };

                // Update ADX state
                s.dx_smooth =
                    (s.dx_smooth * (Decimal::from(*len) - Decimal::ONE) + dx) / Decimal::from(*len);

                s.prev_high = h;
                s.prev_low = l;
                s.prev_close = c;
            }
        }

        // SuperTrend Shift
        for (key, s) in &mut self.st_states {
            if s.initialized {
                let parts: Vec<&str> = key.split('-').collect();
                let len: usize = parts[0].parse().unwrap_or(10);
                let mult = s.multiplier;

                let tr = std::cmp::max(
                    h - l,
                    std::cmp::max((h - s.prev_close).abs(), (l - s.prev_close).abs()),
                );
                // Update ATR state (RMA)
                s.atr = (s.atr * (Decimal::from(len) - Decimal::ONE) + tr) / Decimal::from(len);

                let basic_upper = (h + l) / Decimal::TWO + mult * s.atr;
                let basic_lower = (h + l) / Decimal::TWO - mult * s.atr;

                // Same consolidation rule as initialize() and update(): tighten
                // toward basic while it stays on the trend side, reset to basic
                // on a close through the old band (see streaming test).
                s.upper = if basic_upper < s.upper || s.prev_close > s.upper {
                    basic_upper
                } else {
                    s.upper
                };
                s.lower = if basic_lower > s.lower || s.prev_close < s.lower {
                    basic_lower
                } else {
                    s.lower
                };

                let mut trend = s.trend;
                if trend == 1 {
                    if c < s.lower {
                        trend = -1;
                    }
                } else {
                    if c > s.upper {
                        trend = 1;
                    }
                }

                s.trend = trend;
                s.prev_close = c;
            }
        }

        // Chop Shift
        for (len, s) in &mut self.chop_states {
            if s.initialized {
                let tr = std::cmp::max(
                    h - l,
                    std::cmp::max((h - s.prev_close).abs(), (l - s.prev_close).abs()),
                );

                s.tr_buffer.push_back(tr);
                s.sum_tr += tr;
                if s.tr_buffer.len() > *len {
                    s.sum_tr -= s.tr_buffer.pop_front().unwrap();
                }

                s.highs.push_back(h);
                if s.highs.len() > *len {
                    s.highs.pop_front();
                }

                s.lows.push_back(l);
                if s.lows.len() > *len {
                    s.lows.pop_front();
                }

                s.prev_close = c;
            }
        }

        // MFI Shift
        for (len, s) in &mut self.mfi_states {
            if s.initialized {
                let tp = (h + l + c) / dec!(3.0);
                let rmf = tp * v;
                let (p, n) = if tp > s.prev_tp {
                    (rmf, Decimal::ZERO)
                } else if tp < s.prev_tp {
                    (Decimal::ZERO, rmf)
                } else {
                    (Decimal::ZERO, Decimal::ZERO)
                };

                s.pos_flow.push_back(p);
                s.sum_p += p;
                if s.pos_flow.len() > *len {
                    s.sum_p -= s.pos_flow.pop_front().unwrap();
                }

                s.neg_flow.push_back(n);
                s.sum_n += n;
                if s.neg_flow.len() > *len {
                    s.sum_n -= s.neg_flow.pop_front().unwrap();
                }

                s.prev_tp = tp;
            }
        }

        // VWAP Shift
        for (key, s) in &mut self.vwap_states {
            let t_dec = Decimal::from_str(&_t_str).unwrap_or(Decimal::ZERO);
            if key == "session" && !s.last_t.is_zero() {
                let day = utc_day_bucket(t_dec);
                let prev_day = utc_day_bucket(s.last_t);
                if day != prev_day {
                    s.cum_pv = Decimal::ZERO;
                    s.cum_vol = Decimal::ZERO;
                }
            }
            let tp = (h + l + c) / dec!(3.0);
            s.cum_pv += tp * v;
            s.cum_vol += v;
            s.last_t = t_dec;
        }

        // PSAR Shift — commit the step for the candle that just closed
        // (FEAT-0316). The clamp uses this bar as the new prev range.
        for (_, st) in &mut self.psar_states {
            if !st.initialized {
                continue;
            }
            let (mut advanced, _) = psar_step(
                *st,
                h,
                l,
                st.prev_high,
                st.prev_low,
                true,
                st.prev2_high,
                st.prev2_low,
            );
            advanced.prev2_high = advanced.prev_high;
            advanced.prev2_low = advanced.prev_low;
            advanced.prev_high = h;
            advanced.prev_low = l;
            *st = advanced;
        }

        // Pivots Shift — the just-closed candle becomes the pivot basis of
        // the next call, matching the reference's "previous candle" rule.
        if self.pivots_state.initialized {
            if let Some(ps) = self.settings.pivots.first() {
                let mut next = self.pivots_state;
                let (p, r1, r2, r3, s1, s2, s3) =
                    compute_pivot_levels(&ps.type_, h, l, c);
                next.p = p;
                next.r1 = r1;
                next.r2 = r2;
                next.r3 = r3;
                next.s1 = s1;
                next.s2 = s2;
                next.s3 = s3;
                next.basis_h = h;
                next.basis_l = l;
                next.basis_c = c;
                self.pivots_state = next;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_supertrend_multiplier() {
        let mut calc = TechnicalsCalculator::new();

        // Mock data for initialization
        let closes = vec!["100".to_string(); 20];
        let highs = vec!["105".to_string(); 20];
        let lows = vec!["95".to_string(); 20];
        let volumes = vec!["1000".to_string(); 20];
        let times = vec![0.0; 20];

        // Settings with specific multiplier 4.5
        let settings_json = r#"{
            "supertrend": [{ "length": 14, "multiplier": 4.5 }]
        }"#;

        calc.initialize(closes, highs, lows, volumes, &times, settings_json);

        // Verify that the state was initialized with the correct multiplier
        // Key is "14-4.5"
        let state = calc
            .st_states
            .get("14-4.5")
            .expect("SuperTrend state should exist");

        assert_eq!(
            state.multiplier,
            dec!(4.5),
            "Multiplier should be dec!(4.5) as set in settings"
        );
    }

    fn series(values: &[&str]) -> Vec<String> {
        values.iter().map(|v| v.to_string()).collect()
    }

    /// The whole point of BUG-0182: a value that f64 cannot represent must
    /// survive the round trip unchanged. In f64, 0.1 + 0.2 + 0.3 is
    /// 0.6000000000000001, so an f64 engine cannot produce exactly "0.3" here.
    #[test]
    fn test_initialize_and_update_are_exact() {
        let mut calc = TechnicalsCalculator::new();
        let closes = series(&["0.1", "0.2", "0.3"]);
        let volumes = series(&["1", "1", "1"]);
        let times = vec![0.0; 3];

        calc.initialize(
            closes.clone(),
            closes.clone(),
            closes,
            volumes,
            &times,
            r#"{"sma":[{"length":3}]}"#,
        );

        let json = calc.update(
            "0.4".into(),
            "0.4".into(),
            "0.4".into(),
            "0.4".into(),
            "1".into(),
            "0".into(),
        );

        // (0.1 + 0.2 + 0.3 - 0.1 + 0.4) / 3 == 0.3, exactly.
        assert!(
            json.contains(r#""SMA3":"0.3""#),
            "SMA3 should be exactly 0.3, got {}",
            json
        );
    }

    /// Financial values must leave the module as strings, never as JSON
    /// numbers — a JSON number would hand the precision straight back.
    #[test]
    fn test_output_values_are_decimal_strings() {
        let mut calc = TechnicalsCalculator::new();
        let closes = series(&["1", "2", "3"]);
        let times = vec![0.0; 3];

        calc.initialize(
            closes.clone(),
            closes.clone(),
            closes.clone(),
            closes,
            &times,
            r#"{"sma":[{"length":3}]}"#,
        );

        let json = calc.update(
            "4".into(),
            "4".into(),
            "4".into(),
            "4".into(),
            "1".into(),
            "0".into(),
        );

        let parsed: serde_json::Value = serde_json::from_str(&json).expect("valid JSON");
        let sma = &parsed["movingAverages"]["SMA3"];
        assert!(
            sma.is_string(),
            "indicator values must serialize as strings, got {}",
            sma
        );
    }

    // ---- FEAT-0316 / BUG-0315 regression tests ----
    //
    // Each reference implementation below mirrors the TypeScript source in
    // src/utils/indicators.ts line for line, so a divergence between the
    // engines shows up as an exact-value failure here.

    fn hma_reference(closes: &[Decimal], period: usize) -> Decimal {
        let half = period / 2;
        let sqrt_p = (period as f64).sqrt() as usize;
        let mut combined: Vec<Decimal> = Vec::new();
        for i in (period - 1)..closes.len() {
            let wh = wma_of(&closes[i + 1 - half..i + 1]);
            let wf = wma_of(&closes[i + 1 - period..i + 1]);
            combined.push(wh * Decimal::TWO - wf);
        }
        wma_of(&combined[combined.len() - sqrt_p..])
    }

    #[test]
    fn test_hma_is_the_full_wma_chain() {
        let closes = series(&[
            "10", "11", "12", "11", "13", "14", "15", "14", "16", "17", "18", "17", "19", "20",
            "21", "20", "22", "23", "24", "25",
        ]);
        let highs = series(&["11"; 20]);
        let lows = series(&["9"; 20]);
        let vols = series(&["1000"; 20]);
        let times = vec![0.0; 20];

        let mut calc = TechnicalsCalculator::new();
        calc.initialize(
            closes.clone(),
            highs.clone(),
            lows.clone(),
            vols.clone(),
            &times,
            r#"{"hma":[{"length":9}]}"#,
        );

        // Feed one more candle through update() — protocol: initialize on
        // history, update with the new candle.
        let json = calc.update(
            "26".into(),
            "27".into(),
            "25".into(),
            "26".into(),
            "1100".into(),
            "1".into(),
        );
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("valid JSON");

        let mut full: Vec<Decimal> = closes.iter().map(|s| Decimal::from_str(s).unwrap()).collect();
        full.push(Decimal::from(26));
        let expected = hma_reference(&full, 9);

        assert_eq!(
            parsed["movingAverages"]["HMA9"].as_str().unwrap(),
            expected.to_string(),
            "HMA must equal WMA(2·WMA(n/2) − WMA(n), sqrt(n)) over the full chain"
        );
    }

    #[test]
    fn test_mfi_matches_window_reference() {
        let n = 30usize;
        let closes: Vec<String> = (0..n)
            .map(|i| ((i * 7) % 23 + 90).to_string())
            .collect();
        let highs: Vec<String> = (0..n)
            .map(|i| ((i * 7) % 23 + 91).to_string())
            .collect();
        let lows: Vec<String> = (0..n)
            .map(|i| ((i * 7) % 23 + 89).to_string())
            .collect();
        let vols: Vec<String> = (0..n).map(|i| (500 + i * 13).to_string()).collect();
        let times = vec![0.0; n];
        let period = 14;

        let mut calc = TechnicalsCalculator::new();
        calc.initialize(
            closes.clone(),
            highs.clone(),
            lows.clone(),
            vols.clone(),
            &times,
            r#"{"mfi":[{"length":14}]}"#,
        );

        let json = calc.update(
            "120".into(),
            "121".into(),
            "119".into(),
            "120".into(),
            "900".into(),
            "1".into(),
        );
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("valid JSON");

        // Reference: TS calculateMFI over the last `period` changes,
        // including the updated candle.
        let dec = |v: &str| Decimal::from_str(v).unwrap();
        let tp = |i: usize| (dec(&highs[i]) + dec(&lows[i]) + dec(&closes[i])) / dec!(3);
        let mut all_closes = closes.clone();
        all_closes.push("120".into());
        let mut all_highs = highs.clone();
        all_highs.push("121".into());
        let mut all_lows = lows.clone();
        all_lows.push("119".into());
        let mut all_vols = vols.clone();
        all_vols.push("900".into());
        let m = all_closes.len();

        let mut pos_flow = Decimal::ZERO;
        let mut neg_flow = Decimal::ZERO;
        let start = m - period;
        let mut prev_tp =
            (dec(&all_highs[start - 1]) + dec(&all_lows[start - 1]) + dec(&all_closes[start - 1]))
                / dec!(3);
        for i in start..m {
            let t = (dec(&all_highs[i]) + dec(&all_lows[i]) + dec(&all_closes[i])) / dec!(3);
            let rmf = t * dec(&all_vols[i]);
            if t > prev_tp {
                pos_flow += rmf;
            } else if t < prev_tp {
                neg_flow += rmf;
            }
            prev_tp = t;
        }
        let expected = if neg_flow == Decimal::ZERO {
            dec!(100)
        } else {
            dec!(100) - (dec!(100) / (Decimal::ONE + pos_flow / neg_flow))
        };

        assert_eq!(
            parsed["oscillators"][format!("MFI{}", period)].as_str().unwrap(),
            expected.to_string(),
            "rolling MFI must equal the windowed reference"
        );
        let _ = tp(0); // silence unused helper in case of refactors
    }

    #[test]
    fn test_rsi_all_gains_is_exactly_100() {
        let closes = series(&["10", "11", "12", "13", "14", "15"]);
        let times = vec![0.0; 6];
        let mut calc = TechnicalsCalculator::new();
        calc.initialize(
            closes.clone(),
            closes.clone(),
            closes.clone(),
            closes.clone(),
            &times,
            r#"{"rsi":[{"length":4}]}"#,
        );
        let json = calc.update("16".into(), "16".into(), "16".into(), "16".into(), "1".into(), "2".into());
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("valid JSON");
        let got = Decimal::from_str(parsed["oscillators"]["RSI4"].as_str().unwrap()).unwrap();
        assert_eq!(
            got,
            Decimal::from(100),
            "an all-gains window must yield exactly RSI 100"
        );
    }

    #[test]
    fn test_vwap_session_resets_on_utc_day_change() {
        // Two candles on day 0, two candles on day 1 (UTC).
        let day_ms = 86_400_000f64;
        let times = vec![1_000.0, 2_000.0, day_ms + 1_000.0, day_ms + 2_000.0];
        let closes = series(&["100", "102", "104", "106"]);
        let highs = series(&["101", "103", "105", "107"]);
        let lows = series(&["99", "101", "103", "105"]);
        let vols = series(&["10", "10", "10", "10"]);

        let mut calc = TechnicalsCalculator::new();
        calc.initialize(
            closes,
            highs.clone(),
            lows.clone(),
            vols.clone(),
            &times,
            r#"{"vwap":[{"anchor":"session"}]}"#,
        );
        // Update with a fifth candle still on day 1.
        let json = calc.update("108".into(), "109".into(), "107".into(), "108".into(), "10".into(), (day_ms + 3_000.0).to_string());
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("valid JSON");

        // Expected: only day-2 candles contribute.
        let dec = Decimal::from_str;
        let tp = |h: &str, l: &str, c: &str| (dec(h).unwrap() + dec(l).unwrap() + dec(c).unwrap()) / dec!(3);
        let cum_pv = tp("105", "103", "104") * dec("10").unwrap()
            + tp("107", "105", "106") * dec("10").unwrap()
            + tp("109", "107", "108") * dec("10").unwrap();
        let cum_vol = dec("30").unwrap();
        let expected = cum_pv / cum_vol;

        let got = Decimal::from_str(parsed["volatility"]["VWAP_session"].as_str().unwrap())
            .expect("VWAP must serialize as decimal string");
        assert_eq!(
            got,
            expected,
            "session VWAP must reset its cumulative sums at UTC midnight"
        );
    }

    /// The TS psar loop from src/utils/indicators.ts, reimplemented on f64 —
    /// the WASM engine runs the same state machine on Decimal, so values are
    /// compared with a small float tolerance.
    #[test]
    fn test_psar_matches_reference_replay() {
        let n = 40usize;
        let highs: Vec<String> = (0..n).map(|i| format!("{}", 100 + (i * 5) % 31)).collect();
        let lows: Vec<String> = (0..n).map(|i| format!("{}", 90 + (i * 3) % 27)).collect();
        let closes: Vec<String> = (0..n).map(|i| format!("{}", 95 + (i * 7) % 29)).collect();
        let vols: Vec<String> = vec!["1000".to_string(); n];
        let times = vec![0.0; n];

        let mut calc = TechnicalsCalculator::new();
        calc.initialize(
            closes,
            highs.clone(),
            lows.clone(),
            vols,
            &times,
            r#"{"psar":[{"start":0.02,"increment":0.02,"max":0.2}]}"#,
        );
        let json = calc.update("130".into(), "131".into(), "129".into(), "130".into(), "1000".into(), "1".into());
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("valid JSON");
        let got: f64 = parsed["volatility"]["PSAR"]
            .as_str()
            .unwrap()
            .parse()
            .unwrap();

        // f64 reference replay (JSIndicators.psar), extended by the updated candle.
        let h: Vec<f64> = highs.iter().chain(std::iter::once(&"131".to_string())).map(|s| s.parse().unwrap()).collect();
        let l: Vec<f64> = lows.iter().chain(std::iter::once(&"129".to_string())).map(|s| s.parse().unwrap()).collect();
        let (start, inc, max) = (0.02f64, 0.02f64, 0.2f64);
        let mut is_long = true;
        let mut af = start;
        let mut ep = h[0];
        let mut sar = l[0];
        for i in 1..h.len() {
            let mut next_sar = sar + af * (ep - sar);
            if is_long {
                if next_sar > l[i - 1] { next_sar = l[i - 1]; }
                if i > 1 && next_sar > l[i - 2] { next_sar = l[i - 2]; }
            } else {
                if next_sar < h[i - 1] { next_sar = h[i - 1]; }
                if i > 1 && next_sar < h[i - 2] { next_sar = h[i - 2]; }
            }
            let mut reversed = false;
            if is_long {
                if l[i] < next_sar { is_long = false; reversed = true; next_sar = ep; ep = l[i]; af = start; }
            } else {
                if h[i] > next_sar { is_long = true; reversed = true; next_sar = ep; ep = h[i]; af = start; }
            }
            if !reversed {
                if is_long {
                    if h[i] > ep { ep = h[i]; af = af + inc; if af > max { af = max; } }
                } else {
                    if l[i] < ep { ep = l[i]; af = af + inc; if af > max { af = max; } }
                }
            }
            sar = next_sar;
        }

        let tolerance = sar.abs() * 1e-9 + 1e-9;
        assert!(
            (got - sar).abs() <= tolerance,
            "PSAR replay diverged from reference: got {}, expected {}",
            got,
            sar
        );
    }

    #[test]
    fn test_pivots_use_previous_candle_classic() {
        let closes = series(&["10", "20", "30"]);
        let highs = series(&["12", "22", "32"]);
        let lows = series(&["8", "18", "28"]);
        let vols = series(&["100", "100", "100"]);
        let times = vec![0.0, 1.0, 2.0];

        let mut calc = TechnicalsCalculator::new();
        calc.initialize(closes, highs, lows, vols, &times, r#"{"pivots":[{"type_":"classic"}]}"#);

        let json = calc.update("40".into(), "42".into(), "38".into(), "40".into(), "100".into(), "3".into());
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("valid JSON");

        // Basis is candle index len-2 of the full series = ("32","28","30").
        let d = |v: &str| Decimal::from_str(v).unwrap();
        let p = (d("32") + d("28") + d("30")) / dec!(3);
        let expected = [
            ("P", p),
            ("R1", p * dec!(2) - d("28")),
            ("R2", p + (d("32") - d("28"))),
            ("R3", d("32") + (p - d("28")) * dec!(2)),
            ("S1", p * dec!(2) - d("32")),
            ("S2", p - (d("32") - d("28"))),
            ("S3", d("28") - (d("32") - p) * dec!(2)),
        ];
        for (key, want) in expected {
            assert_eq!(
                parsed["pivots"][key].as_str().unwrap(),
                want.to_string(),
                "pivot level {} must come from the previous candle",
                key
            );
        }
    }

    /// Most period inputs in the settings UI have no lower bound. Under f64 a
    /// zero period produced a NaN reading; under Decimal an unguarded divisor
    /// would panic and take the whole calculator instance down.
    #[test]
    fn test_degenerate_periods_do_not_panic() {
        let mut calc = TechnicalsCalculator::new();
        let closes = series(&["100"; 30]);
        let times = vec![0.0; 30];

        let settings_json = r#"{
            "ema": [{ "length": 0 }],
            "sma": [{ "length": 0 }],
            "wma": [{ "length": 0 }],
            "vwma": [{ "length": 0 }],
            "hma": [{ "length": 1 }],
            "rsi": [{ "length": 0 }],
            "macd": [{ "fast": 0, "slow": 0, "signal": 0 }],
            "bb": [{ "length": 0, "std_dev": 2 }],
            "atr": [{ "length": 0 }],
            "stoch": [{ "k": 0, "d": 0, "smooth": 0 }],
            "cci": [{ "length": 0 }],
            "adx": [{ "length": 0 }],
            "supertrend": [{ "length": 0, "multiplier": 3 }],
            "mom": [{ "length": 0 }],
            "wr": [{ "length": 0 }],
            "volma": [{ "length": 0 }],
            "chop": [{ "length": 1 }],
            "mfi": [{ "length": 0 }]
        }"#;

        calc.initialize(
            closes.clone(),
            closes.clone(),
            closes.clone(),
            closes,
            &times,
            settings_json,
        );

        // Must return rather than trap; the misconfigured indicators are simply
        // absent from the output.
        let json = calc.update(
            "100".into(),
            "100".into(),
            "100".into(),
            "100".into(),
            "1".into(),
            "0".into(),
        );
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("valid JSON");
        assert!(parsed["movingAverages"].as_object().unwrap().is_empty());
        assert!(parsed["oscillators"].as_object().unwrap().is_empty());
    }

    /// A completely flat series makes CHOP's log10 arguments degenerate.
    #[test]
    fn test_flat_series_does_not_panic() {
        let mut calc = TechnicalsCalculator::new();
        let closes = series(&["100"; 30]);
        let times = vec![0.0; 30];

        calc.initialize(
            closes.clone(),
            closes.clone(),
            closes.clone(),
            closes,
            &times,
            r#"{"chop":[{"length":14}],"atr":[{"length":14}],"wr":[{"length":14}]}"#,
        );

        let json = calc.update(
            "100".into(),
            "100".into(),
            "100".into(),
            "100".into(),
            "1".into(),
            "0".into(),
        );
        serde_json::from_str::<serde_json::Value>(&json).expect("valid JSON");
    }

    /// Streaming protocol equivalence: feeding candles one by one via
    /// update() [read] + shift() [commit] must produce byte-identical output
    /// to batch-initializing on the same history and updating with the final
    /// candle. This pins the update/shift contract for every family at once —
    /// in particular PSAR's state machine and Stochastic's smoothing windows,
    /// where a double-advance or off-by-one window would diverge immediately.
    #[test]
    fn test_streaming_update_shift_equals_batch() {
        let n = 80usize;
        let closes: Vec<String> = (0..n).map(|i| format!("{}", 90 + (i * 7) % 29)).collect();
        let highs: Vec<String> = (0..n).map(|i| format!("{}", 95 + (i * 5) % 31)).collect();
        let lows: Vec<String> = (0..n).map(|i| format!("{}", 85 + (i * 3) % 27)).collect();
        let vols: Vec<String> = (0..n).map(|i| format!("{}", 500 + i * 13)).collect();
        // Cross a UTC-day boundary every 25 candles so session VWAP resets
        // are part of the streamed path too.
        let times: Vec<String> = (0..n)
            .map(|i| format!("{}", (i / 25) as f64 * 86_400_000.0 + (i % 25) as f64 * 60_000.0))
            .collect();
        let times_f64: Vec<f64> = times.iter().map(|t| t.parse().unwrap()).collect();

        let settings = r#"{
            "ema": [{ "length": 10 }],
            "sma": [{ "length": 9 }],
            "wma": [{ "length": 12 }],
            "vwma": [{ "length": 8 }],
            "hma": [{ "length": 9 }],
            "rsi": [{ "length": 14 }],
            "macd": [{ "fast": 12, "slow": 26, "signal": 9 }],
            "bb": [{ "length": 20, "std_dev": "2" }],
            "atr": [{ "length": 14 }],
            "stoch": [{ "k": 14, "d": 3, "smooth": 3 }],
            "cci": [{ "length": 20 }],
            "adx": [{ "length": 14 }],
            "supertrend": [{ "length": 10, "multiplier": 3 }],
            "mom": [{ "length": 10 }],
            "wr": [{ "length": 14 }],
            "volma": [{ "length": 12 }],
            "chop": [{ "length": 14 }],
            "mfi": [{ "length": 14 }],
            "vwap": [{ "anchor": "session" }],
            "psar": [{ "start": 0.02, "increment": 0.02, "max": 0.2 }],
            "pivots": [{ "type_": "classic" }]
        }"#;

        let candle_args = |i: usize| -> (String, String, String, String, String, String) {
            (
                closes[i].clone(),
                highs[i].clone(),
                lows[i].clone(),
                closes[i].clone(),
                vols[i].clone(),
                times[i].clone(),
            )
        };

        // Streaming: initialize on history[0..hist_len), then per candle
        // update() to read and shift() to commit.
        let hist_len = 40;
        let mut stream = TechnicalsCalculator::new();
        stream.initialize(
            closes[0..hist_len].to_vec(),
            highs[0..hist_len].to_vec(),
            lows[0..hist_len].to_vec(),
            vols[0..hist_len].to_vec(),
            &times_f64[0..hist_len],
            settings,
        );
        let mut streaming_last = String::new();
        for i in hist_len..n {
            let (o, h, l, c, v, t) = candle_args(i);
            streaming_last = stream.update(o.clone(), h.clone(), l.clone(), c.clone(), v.clone(), t.clone());
            stream.shift(o, h, l, c, v, t);
        }

        // Batch reference: same total history minus the last candle, then a
        // single update with it — the exact production call shape.
        let mut batch = TechnicalsCalculator::new();
        batch.initialize(
            closes[0..n - 1].to_vec(),
            highs[0..n - 1].to_vec(),
            lows[0..n - 1].to_vec(),
            vols[0..n - 1].to_vec(),
            &times_f64[0..n - 1],
            settings,
        );
        let (_, h, l, c, v, t) = candle_args(n - 1);
        let batch_last = batch.update(closes[n - 1].clone(), h, l, c, v, t);

        // HashMap iteration order differs between instances — compare parsed
        // values so key order is ignored while every decimal string stays exact.
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&streaming_last).unwrap(),
            serde_json::from_str::<serde_json::Value>(&batch_last).unwrap(),
            "streamed update/shift output must equal the batch path exactly"
        );

        // Probe with one FRESH candle beyond the series: if shift() had
        // double-advanced any state machine (PSAR) or used wrong smoothing
        // windows (Stochastic), the committed state now differs from a batch
        // calculator built over all n candles, and this read diverges.
        let probe_c = format!("{}", 90 + (n * 7) % 29);
        let probe_h = format!("{}", 95 + (n * 5) % 31);
        let probe_l = format!("{}", 85 + (n * 3) % 27);
        let probe_v = format!("{}", 500 + n * 13);
        let probe_t = format!("{}", (n / 25) as f64 * 86_400_000.0 + (n % 25) as f64 * 60_000.0);

        let streamed_probe = stream.update(
            probe_c.clone(), probe_h.clone(), probe_l.clone(),
            probe_c.clone(), probe_v.clone(), probe_t.clone(),
        );

        let mut batch_full = TechnicalsCalculator::new();
        batch_full.initialize(
            closes.clone(),
            highs.clone(),
            lows.clone(),
            vols.clone(),
            &times_f64,
            settings,
        );
        let batch_probe = batch_full.update(
            probe_c.clone(), probe_h, probe_l,
            probe_c, probe_v, probe_t,
        );
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&streamed_probe).unwrap(),
            serde_json::from_str::<serde_json::Value>(&batch_probe).unwrap(),
            "state after streamed commits must be indistinguishable from batch state"
        );
    }
}
pub mod alert_engine;
pub mod alert_engine_tests;
pub mod alert_exports;
