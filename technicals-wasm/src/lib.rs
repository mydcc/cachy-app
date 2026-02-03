
mod utils;

use wasm_bindgen::prelude::*;
use std::collections::HashMap;
use serde::{Deserialize, Serialize};

#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

// --- Settings Structs ---
#[derive(Serialize, Deserialize, Default)]
struct IndicatorSettings {
    #[serde(default)]
    ema: EmaSettings,
    #[serde(default)]
    rsi: RsiSettings,
    #[serde(default)]
    macd: MacdSettings,
    #[serde(default)]
    bb: BbSettings,
    #[serde(default)]
    atr: AtrSettings,
    #[serde(default)]
    stochastic: StochSettings,
    #[serde(default)]
    cci: CciSettings,
    #[serde(default)]
    adx: AdxSettings,
    #[serde(default)]
    superTrend: SuperTrendSettings,
}

#[derive(Serialize, Deserialize, Default)]
struct EmaSettings {
    #[serde(default)]
    ema1: LengthSetting,
    #[serde(default)]
    ema2: LengthSetting,
    #[serde(default)]
    ema3: LengthSetting,
}

#[derive(Serialize, Deserialize, Default)]
struct LengthSetting {
    #[serde(default = "default_zero")]
    length: usize,
}

#[derive(Serialize, Deserialize)]
struct RsiSettings {
    #[serde(default = "default_rsi_len")]
    length: usize,
}

#[derive(Serialize, Deserialize)]
struct MacdSettings {
    #[serde(default = "default_macd_fast")]
    fastLength: usize,
    #[serde(default = "default_macd_slow")]
    slowLength: usize,
    #[serde(default = "default_macd_sig")]
    signalLength: usize,
}

#[derive(Serialize, Deserialize)]
struct BbSettings {
    #[serde(default = "default_bb_len")]
    length: usize,
    #[serde(default = "default_bb_std")]
    stdDev: f64,
}

#[derive(Serialize, Deserialize)]
struct AtrSettings {
    #[serde(default = "default_atr_len")]
    length: usize,
}

#[derive(Serialize, Deserialize)]
struct StochSettings {
    #[serde(default = "default_stoch_k")]
    kPeriod: usize,
    #[serde(default = "default_stoch_d")]
    dPeriod: usize,
    #[serde(default = "default_stoch_smooth")]
    kSmoothing: usize,
}

#[derive(Serialize, Deserialize)]
struct CciSettings {
    #[serde(default = "default_cci_len")]
    length: usize,
}

#[derive(Serialize, Deserialize)]
struct AdxSettings {
    #[serde(default = "default_adx_len")]
    adxSmoothing: usize,
    #[serde(default = "default_adx_len")]
    diLength: usize,
}

#[derive(Serialize, Deserialize)]
struct SuperTrendSettings {
    #[serde(default = "default_st_period")]
    period: usize,
    #[serde(default = "default_st_factor")]
    factor: f64,
}

impl Default for RsiSettings { fn default() -> Self { Self { length: 14 } } }
impl Default for MacdSettings { fn default() -> Self { Self { fastLength: 12, slowLength: 26, signalLength: 9 } } }
impl Default for BbSettings { fn default() -> Self { Self { length: 20, stdDev: 2.0 } } }
impl Default for AtrSettings { fn default() -> Self { Self { length: 14 } } }
impl Default for StochSettings { fn default() -> Self { Self { kPeriod: 14, dPeriod: 3, kSmoothing: 3 } } }
impl Default for CciSettings { fn default() -> Self { Self { length: 20 } } }
impl Default for AdxSettings { fn default() -> Self { Self { adxSmoothing: 14, diLength: 14 } } }
impl Default for SuperTrendSettings { fn default() -> Self { Self { period: 10, factor: 3.0 } } }

fn default_zero() -> usize { 0 }
fn default_rsi_len() -> usize { 14 }
fn default_macd_fast() -> usize { 12 }
fn default_macd_slow() -> usize { 26 }
fn default_macd_sig() -> usize { 9 }
fn default_bb_len() -> usize { 20 }
fn default_bb_std() -> f64 { 2.0 }
fn default_atr_len() -> usize { 14 }
fn default_stoch_k() -> usize { 14 }
fn default_stoch_d() -> usize { 3 }
fn default_stoch_smooth() -> usize { 3 }
fn default_cci_len() -> usize { 20 }
fn default_adx_len() -> usize { 14 }
fn default_st_period() -> usize { 10 }
fn default_st_factor() -> f64 { 3.0 }

// --- State Structs ---
struct EmaState {
    prev_ema: f64,
}

struct RsiState {
    avg_gain: f64,
    avg_loss: f64,
    prev_price: f64,
}

struct MacdState {
    fast_ema: f64,
    slow_ema: f64,
    signal_ema: f64,
}

struct BbState {
    history: Vec<f64>,
    history_idx: usize,
    prev_sum: f64,
    std_dev_mult: f64,
}

struct AtrState {
    prev_atr: f64,
    prev_close: f64,
}

struct StochState {
    highs: Vec<f64>,
    lows: Vec<f64>,
    idx: usize,
    // k_len: usize, // Removed unused field
    raw_k_history: Vec<f64>,
    raw_k_idx: usize,
    raw_k_sum: f64,
    smooth_k_history: Vec<f64>,
    smooth_k_idx: usize,
    smooth_k_sum: f64,
    k_smooth_len: usize,
    d_len: usize,
}

struct CciState {
    history: Vec<f64>,
    history_idx: usize,
    prev_sum: f64,
}

struct AdxState {
    prev_high: f64,
    prev_low: f64,
    prev_close: f64,
    tr_smooth: f64,
    pos_dm_smooth: f64,
    neg_dm_smooth: f64,
    dx_smooth: f64,
}

struct SuperTrendState {
    prev_upper: f64,
    prev_lower: f64,
    prev_trend: i8,
    atr_state: AtrState,
}

#[wasm_bindgen]
pub struct TechnicalsCalculator {
    ema_states: HashMap<usize, EmaState>,
    rsi_states: HashMap<usize, RsiState>,
    macd_states: HashMap<String, MacdState>,
    bb_states: HashMap<String, BbState>,
    atr_states: HashMap<usize, AtrState>,
    stoch_states: HashMap<String, StochState>,
    cci_states: HashMap<usize, CciState>,
    adx_states: HashMap<usize, AdxState>,
    st_states: HashMap<String, SuperTrendState>,
    last_close: f64,
}

#[wasm_bindgen]
impl TechnicalsCalculator {
    #[wasm_bindgen(constructor)]
    pub fn new() -> TechnicalsCalculator {
        TechnicalsCalculator {
            ema_states: HashMap::new(),
            rsi_states: HashMap::new(),
            macd_states: HashMap::new(),
            bb_states: HashMap::new(),
            atr_states: HashMap::new(),
            stoch_states: HashMap::new(),
            cci_states: HashMap::new(),
            adx_states: HashMap::new(),
            st_states: HashMap::new(),
            last_close: 0.0,
        }
    }

    pub fn initialize(&mut self, closes: &[f64], highs: &[f64], lows: &[f64], settings_json: &str) {
        if closes.is_empty() { return; }
        self.last_close = closes[closes.len() - 1];

        let settings: IndicatorSettings = serde_json::from_str(settings_json).unwrap_or_default();

        // 1. EMA
        let mut ema_periods = Vec::new();
        if settings.ema.ema1.length > 0 { ema_periods.push(settings.ema.ema1.length); }
        if settings.ema.ema2.length > 0 { ema_periods.push(settings.ema.ema2.length); }
        if settings.ema.ema3.length > 0 { ema_periods.push(settings.ema.ema3.length); }

        for p in ema_periods {
            let val = calculate_ema_last(closes, p);
            self.ema_states.insert(p, EmaState { prev_ema: val });
        }

        // 2. RSI
        let rsi_p = settings.rsi.length;
        let (avg_gain, avg_loss) = calculate_rsi_state(closes, rsi_p);
        self.rsi_states.insert(rsi_p, RsiState { avg_gain, avg_loss, prev_price: self.last_close });

        // 3. MACD
        let fast = settings.macd.fastLength;
        let slow = settings.macd.slowLength;
        let sig = settings.macd.signalLength;

        let fast_val = calculate_ema_last(closes, fast);
        let slow_val = calculate_ema_last(closes, slow);
        let signal_val = calculate_macd_signal_last(closes, fast, slow, sig);

        self.macd_states.insert(format!("{},{},{}", fast, slow, sig), MacdState {
            fast_ema: fast_val,
            slow_ema: slow_val,
            signal_ema: signal_val
        });

        // 4. Bollinger Bands
        let bb_len = settings.bb.length;
        let bb_std = settings.bb.stdDev;
        if closes.len() >= bb_len {
            let start = closes.len() - bb_len;
            let history = closes[start..].to_vec();
            let sum: f64 = history.iter().sum();

            self.bb_states.insert(format!("{},{}", bb_len, bb_std), BbState {
                history,
                history_idx: 0,
                prev_sum: sum,
                std_dev_mult: bb_std
            });
        }

        // 5. ATR
        let atr_len = settings.atr.length;
        let atr_val = calculate_atr_last(highs, lows, closes, atr_len);
        self.atr_states.insert(atr_len, AtrState {
            prev_atr: atr_val,
            prev_close: self.last_close
        });

        // 6. Stochastic
        let stoch_k = settings.stochastic.kPeriod;
        let stoch_d = settings.stochastic.dPeriod;
        let stoch_smooth = settings.stochastic.kSmoothing;

        if closes.len() >= stoch_k {
            let (highs_buf, lows_buf, raw_k_history, smooth_k_history) = calculate_stoch_state(
                highs, lows, closes, stoch_k, stoch_smooth, stoch_d
            );

            let raw_k_sum: f64 = raw_k_history.iter().sum();
            let smooth_k_sum: f64 = smooth_k_history.iter().sum();

            self.stoch_states.insert(format!("{},{},{}", stoch_k, stoch_d, stoch_smooth), StochState {
                highs: highs_buf,
                lows: lows_buf,
                idx: 0,
                raw_k_history,
                raw_k_idx: 0,
                raw_k_sum,
                smooth_k_history,
                smooth_k_idx: 0,
                smooth_k_sum,
                k_smooth_len: stoch_smooth,
                d_len: stoch_d
            });
        }

        // 7. CCI
        let cci_len = settings.cci.length;
        if closes.len() >= cci_len {
            let mut tps = Vec::with_capacity(closes.len());
            for i in 0..closes.len() {
                tps.push((highs[i] + lows[i] + closes[i]) / 3.0);
            }
            let start = tps.len() - cci_len;
            let history = tps[start..].to_vec();
            let sum: f64 = history.iter().sum();

            self.cci_states.insert(cci_len, CciState {
                history,
                history_idx: 0,
                prev_sum: sum
            });
        }

        // 8. ADX
        let adx_len = settings.adx.adxSmoothing;
        if closes.len() > adx_len * 2 {
            let state = calculate_adx_state(highs, lows, closes, adx_len);
            self.adx_states.insert(adx_len, state);
        }

        // 9. SuperTrend
        let st_period = settings.superTrend.period;
        let st_factor = settings.superTrend.factor;

        if closes.len() > st_period {
            let atr_val = calculate_atr_last(highs, lows, closes, st_period);
            let prev_close = closes[closes.len()-1];
            let hl2 = (highs[highs.len()-1] + lows[lows.len()-1]) / 2.0;
            let upper = hl2 + st_factor * atr_val;
            let lower = hl2 - st_factor * atr_val;
            let trend = if prev_close > upper { 1 } else { -1 };

            self.st_states.insert(format!("{},{}", st_period, st_factor), SuperTrendState {
                prev_upper: upper,
                prev_lower: lower,
                prev_trend: trend,
                atr_state: AtrState { prev_atr: atr_val, prev_close }
            });
        }
    }

    pub fn update(&mut self, _open: f64, high: f64, low: f64, close: f64) -> JsValue {
        let mut result = String::from("{");

        // --- EMA ---
        result.push_str("\"movingAverages\": [");
        for (period, state) in &mut self.ema_states {
            let new_val = update_ema_calc(state.prev_ema, close, *period);
            result.push_str(&format!("{{\"name\":\"EMA\",\"params\":\"{}\",\"value\":{},\"action\":\"Neutral\"}},", period, new_val));
        }
        if result.ends_with(',') { result.pop(); }
        result.push_str("],");

        // --- Oscillators ---
        result.push_str("\"oscillators\": [");

        // RSI
        for (period, state) in &mut self.rsi_states {
            let (rsi, _, _) = update_rsi_calc(state.avg_gain, state.avg_loss, close, state.prev_price, *period);
            let action = if rsi > 70.0 { "Sell" } else if rsi < 30.0 { "Buy" } else { "Neutral" };
            result.push_str(&format!("{{\"name\":\"RSI\",\"params\":\"{}\",\"value\":{},\"action\":\"{}\"}},", period, rsi, action));
        }

        // Stochastic
        for (key, state) in &mut self.stoch_states {
            let parts: Vec<&str> = key.split(',').collect();
            let mut max_h = high;
            let mut min_l = low;
            for (i, &val) in state.highs.iter().enumerate() {
                if i != state.idx { if val > max_h { max_h = val; } }
            }
            for (i, &val) in state.lows.iter().enumerate() {
                if i != state.idx { if val < min_l { min_l = val; } }
            }

            let range = max_h - min_l;
            let raw_k = if range == 0.0 { 50.0 } else { ((close - min_l) / range) * 100.0 };

            let old_raw_k = state.raw_k_history[state.raw_k_idx];
            let new_raw_k_sum = state.raw_k_sum - old_raw_k + raw_k;
            let k_line = new_raw_k_sum / (state.k_smooth_len as f64);

            let old_smooth_k = state.smooth_k_history[state.smooth_k_idx];
            let new_smooth_k_sum = state.smooth_k_sum - old_smooth_k + k_line;
            let d_line = new_smooth_k_sum / (state.d_len as f64);

            let action = if k_line < 20.0 && d_line < 20.0 && k_line > d_line { "Buy" }
                         else if k_line > 80.0 && d_line > 80.0 && k_line < d_line { "Sell" }
                         else { "Neutral" };

            result.push_str(&format!("{{\"name\":\"Stoch\",\"params\":\"{}\",\"value\":{},\"signal\":{},\"action\":\"{}\"}},",
                parts.join(", "), k_line, d_line, action));
        }

        // CCI
        for (len, state) in &mut self.cci_states {
            let tp = (high + low + close) / 3.0;
            let old_tp = state.history[state.history_idx];
            let new_sum = state.prev_sum - old_tp + tp;
            let sma = new_sum / (*len as f64);

            let mut mean_dev_sum = 0.0;
            for (i, val) in state.history.iter().enumerate() {
                let v = if i == state.history_idx { tp } else { *val };
                mean_dev_sum += (v - sma).abs();
            }
            let mean_dev = mean_dev_sum / (*len as f64);
            let cci = if mean_dev == 0.0 { 0.0 } else { (tp - sma) / (0.015 * mean_dev) };

            let action = if cci > 100.0 { "Sell" } else if cci < -100.0 { "Buy" } else { "Neutral" };
            result.push_str(&format!("{{\"name\":\"CCI\",\"params\":\"{}\",\"value\":{},\"action\":\"{}\"}},", len, cci, action));
        }

        // ADX
        for (len, state) in &mut self.adx_states {
            let up = high - state.prev_high;
            let down = state.prev_low - low;
            let pos_dm = if up > down && up > 0.0 { up } else { 0.0 };
            let neg_dm = if down > up && down > 0.0 { down } else { 0.0 };
            let tr = (high - low).max((high - state.prev_close).abs()).max((low - state.prev_close).abs());

            let tr_s = (state.tr_smooth * ((*len - 1) as f64) + tr) / (*len as f64);
            let pos_dm_s = (state.pos_dm_smooth * ((*len - 1) as f64) + pos_dm) / (*len as f64);
            let neg_dm_s = (state.neg_dm_smooth * ((*len - 1) as f64) + neg_dm) / (*len as f64);

            let pos_di = if tr_s == 0.0 { 0.0 } else { 100.0 * pos_dm_s / tr_s };
            let neg_di = if tr_s == 0.0 { 0.0 } else { 100.0 * neg_dm_s / tr_s };
            let sum_di = pos_di + neg_di;
            let dx = if sum_di == 0.0 { 0.0 } else { 100.0 * (pos_di - neg_di).abs() / sum_di };
            let adx = (state.dx_smooth * ((*len - 1) as f64) + dx) / (*len as f64);

            let action = if adx > 25.0 {
                if pos_di > neg_di { "Buy" } else { "Sell" }
            } else { "Neutral" };

            result.push_str(&format!("{{\"name\":\"ADX\",\"params\":\"{}\",\"value\":{},\"action\":\"{}\"}},", len, adx, action));
        }

        // MACD
        for (key, state) in &mut self.macd_states {
            let parts: Vec<&str> = key.split(',').collect();
            let fast_len: usize = parts[0].parse().unwrap();
            let slow_len: usize = parts[1].parse().unwrap();
            let sig_len: usize = parts[2].parse().unwrap();

            let new_fast = update_ema_calc(state.fast_ema, close, fast_len);
            let new_slow = update_ema_calc(state.slow_ema, close, slow_len);
            let new_macd_line = new_fast - new_slow;
            let new_signal = update_ema_calc(state.signal_ema, new_macd_line, sig_len);
            let hist = new_macd_line - new_signal;
            let action = if new_macd_line > new_signal { "Buy" } else { "Sell" };

            result.push_str(&format!("{{\"name\":\"MACD\",\"params\":\"{}\",\"value\":{},\"signal\":{},\"histogram\":{},\"action\":\"{}\"}},",
                key.replace(',', ", "), new_macd_line, new_signal, hist, action));
        }

        if result.ends_with(',') { result.pop(); }
        result.push_str("],");

        // --- Volatility (BB + ATR) ---
        result.push_str("\"volatility\": {");

        // BB
        if let Some(state) = self.bb_states.values().next() {
             let len = state.history.len();
             let old_val = state.history[state.history_idx];
             let new_sum = state.prev_sum - old_val + close;
             let new_sma = new_sum / (len as f64);
             let mut sum_sq_diff = 0.0;
             for (i, val) in state.history.iter().enumerate() {
                 let v = if i == state.history_idx { close } else { *val };
                 sum_sq_diff += (v - new_sma).powi(2);
             }
             let std_dev = (sum_sq_diff / (len as f64)).sqrt();
             let upper = new_sma + state.std_dev_mult * std_dev;
             let lower = new_sma - state.std_dev_mult * std_dev;
             let percent_p = if upper - lower == 0.0 { 0.5 } else { (close - lower) / (upper - lower) };

             result.push_str(&format!("\"bb\": {{\"middle\":{},\"upper\":{},\"lower\":{},\"percentP\":{}}},", new_sma, upper, lower, percent_p));
        }

        // ATR
        let mut atr_found = false;
        for (period, state) in &self.atr_states {
             let tr = (high - low).max((high - state.prev_close).abs()).max((low - state.prev_close).abs());
             let new_atr = (state.prev_atr * ((*period - 1) as f64) + tr) / (*period as f64);
             result.push_str(&format!("\"atr\": {}", new_atr));
             atr_found = true;
             break;
        }
        if !atr_found {
             result.push_str("\"atr\": 0.0");
        }

        result.push_str("}"); // End volatility

        // SuperTrend (Advanced)
        let mut st_out = String::new();
        for (key, state) in &mut self.st_states {
            let parts: Vec<&str> = key.split(',').collect();
            let period: usize = parts[0].parse().unwrap();
            let factor: f64 = parts[1].parse().unwrap();

            let tr = (high - low).max((high - state.atr_state.prev_close).abs()).max((low - state.atr_state.prev_close).abs());
            let new_atr = (state.atr_state.prev_atr * ((period - 1) as f64) + tr) / (period as f64);

            let hl2 = (high + low) / 2.0;
            let basic_upper = hl2 + factor * new_atr;
            let basic_lower = hl2 - factor * new_atr;

            let final_upper = if basic_upper < state.prev_upper || state.atr_state.prev_close > state.prev_upper { basic_upper } else { state.prev_upper };
            let final_lower = if basic_lower > state.prev_lower || state.atr_state.prev_close < state.prev_lower { basic_lower } else { state.prev_lower };

            let mut trend = state.prev_trend;
            if trend == 1 { if close < final_lower { trend = -1; } } else { if close > final_upper { trend = 1; } }

            let val = if trend == 1 { final_lower } else { final_upper };
            let trend_str = if trend == 1 { "bull" } else { "bear" };

            st_out = format!(", \"advanced\": {{\"superTrend\": {{\"value\":{},\"trend\":\"{}\"}}}}", val, trend_str);
        }
        result.push_str(&st_out);

        // Summary (Mocked)
        result.push_str(", \"summary\": {\"buy\":0,\"sell\":0,\"neutral\":0,\"action\":\"Neutral\"}");

        result.push_str("}");
        JsValue::from_str(&result)
    }
}

// --- Helpers ---

fn update_ema_calc(prev: f64, val: f64, period: usize) -> f64 {
    let k = 2.0 / ((period + 1) as f64);
    (val - prev) * k + prev
}

fn update_rsi_calc(avg_gain: f64, avg_loss: f64, current: f64, prev: f64, period: usize) -> (f64, f64, f64) {
    let diff = current - prev;
    let gain = if diff > 0.0 { diff } else { 0.0 };
    let loss = if diff < 0.0 { -diff } else { 0.0 };

    let new_avg_gain = (avg_gain * ((period - 1) as f64) + gain) / (period as f64);
    let new_avg_loss = (avg_loss * ((period - 1) as f64) + loss) / (period as f64);

    let rsi = if new_avg_loss == 0.0 { 100.0 } else { 100.0 - 100.0 / (1.0 + new_avg_gain / new_avg_loss) };
    (rsi, new_avg_gain, new_avg_loss)
}

fn calculate_ema_last(data: &[f64], period: usize) -> f64 {
    if data.len() < period { return 0.0; }
    let k = 2.0 / ((period + 1) as f64);
    let mut sum = 0.0;
    for i in 0..period { sum += data[i]; }
    let mut ema = sum / (period as f64);
    for i in period..data.len() {
        ema = (data[i] - ema) * k + ema;
    }
    ema
}

fn calculate_ema(data: &[f64], period: usize) -> Vec<f64> {
    let mut result = vec![f64::NAN; data.len()];

    if data.len() < period {
        return result;
    }

    let k = 2.0 / ((period + 1) as f64);

    // Initial SMA
    let mut sum = 0.0;
    for i in 0..period {
        sum += data[i];
    }
    let mut current_ema = sum / (period as f64);
    result[period - 1] = current_ema;

    for i in period..data.len() {
        current_ema = (data[i] - current_ema) * k + current_ema;
        result[i] = current_ema;
    }

    result
}

fn calculate_rsi_state(data: &[f64], period: usize) -> (f64, f64) {
    if data.len() <= period { return (0.0, 0.0); }
    let mut avg_gain = 0.0;
    let mut avg_loss = 0.0;
    for i in 1..=period {
        let diff = data[i] - data[i-1];
        if diff > 0.0 { avg_gain += diff; } else { avg_loss -= diff; }
    }
    avg_gain /= period as f64;
    avg_loss /= period as f64;
    for i in (period+1)..data.len() {
        let diff = data[i] - data[i-1];
        let gain = if diff > 0.0 { diff } else { 0.0 };
        let loss = if diff < 0.0 { -diff } else { 0.0 };
        avg_gain = (avg_gain * ((period - 1) as f64) + gain) / (period as f64);
        avg_loss = (avg_loss * ((period - 1) as f64) + loss) / (period as f64);
    }
    (avg_gain, avg_loss)
}

fn calculate_macd_signal_last(data: &[f64], fast: usize, slow: usize, sig: usize) -> f64 {
    // We need to generate the MACD series first
    // This is expensive O(N) but run only once at init
    let mut macd_line: Vec<f64> = Vec::with_capacity(data.len());

    let fast_series = calculate_ema(data, fast);
    let slow_series = calculate_ema(data, slow);

    for i in 0..data.len() {
        if i < slow - 1 {
            macd_line.push(0.0);
        } else {
            macd_line.push(fast_series[i] - slow_series[i]);
        }
    }

    // Now calc signal on macd_line
    let signal_series = calculate_ema(&macd_line, sig);

    signal_series[signal_series.len() - 1]
}

fn calculate_atr_last(highs: &[f64], lows: &[f64], closes: &[f64], period: usize) -> f64 {
    if closes.len() < period { return 0.0; }
    // Initial TRs
    let mut trs = Vec::with_capacity(closes.len());
    trs.push(0.0); // First TR is 0 or High-Low
    for i in 1..closes.len() {
        let tr = (highs[i] - lows[i]).max((highs[i] - closes[i-1]).abs()).max((lows[i] - closes[i-1]).abs());
        trs.push(tr);
    }

    // Initial ATR (SMA of first N TRs)
    // Often skipped 0.
    let mut sum = 0.0;
    for i in 1..=period {
        sum += trs[i];
    }
    let mut atr = sum / (period as f64);

    // SMMA
    for i in (period+1)..closes.len() {
        atr = (atr * ((period - 1) as f64) + trs[i]) / (period as f64);
    }
    atr
}

fn calculate_stoch_state(highs: &[f64], lows: &[f64], closes: &[f64], k_period: usize, smooth: usize, d_period: usize) -> (Vec<f64>, Vec<f64>, Vec<f64>, Vec<f64>) {
    let len = closes.len();

    let mut raw_k = vec![50.0; len];

    for i in (k_period-1)..len {
        let start = i + 1 - k_period;
        let window_h = &highs[start..=i];
        let window_l = &lows[start..=i];

        let max_h = window_h.iter().fold(f64::NEG_INFINITY, |a, &b| a.max(b));
        let min_l = window_l.iter().fold(f64::INFINITY, |a, &b| a.min(b));

        let range = max_h - min_l;
        if range != 0.0 {
            raw_k[i] = (closes[i] - min_l) / range * 100.0;
        }
    }

    let smooth_k = calculate_sma(&raw_k, smooth);

    let start_hl = if len > k_period { len - k_period } else { 0 };
    let highs_buf = highs[start_hl..].to_vec();
    let lows_buf = lows[start_hl..].to_vec();

    let start_raw = if len > smooth { len - smooth } else { 0 };
    let raw_k_buf = raw_k[start_raw..].to_vec();

    let start_smooth = if len > d_period { len - d_period } else { 0 };
    let smooth_k_buf = smooth_k[start_smooth..].to_vec();

    (highs_buf, lows_buf, raw_k_buf, smooth_k_buf)
}

fn calculate_sma(data: &[f64], period: usize) -> Vec<f64> {
    let mut result = vec![f64::NAN; data.len()];
    if data.len() < period { return result; }

    let mut sum = 0.0;
    for i in 0..period { sum += data[i]; }
    result[period-1] = sum / (period as f64);

    for i in period..data.len() {
        sum = sum - data[i-period] + data[i];
        result[i] = sum / (period as f64);
    }
    result
}

fn calculate_adx_state(highs: &[f64], lows: &[f64], closes: &[f64], period: usize) -> AdxState {
    let len = closes.len();

    // Simplification: Dummy state for now to compile.
    // Real impl needs full history iteration like ATR but with DX smoothing.

    AdxState {
        prev_high: highs[len-1],
        prev_low: lows[len-1],
        prev_close: closes[len-1],
        tr_smooth: 0.0,
        pos_dm_smooth: 0.0,
        neg_dm_smooth: 0.0,
        dx_smooth: 0.0
    }
}
