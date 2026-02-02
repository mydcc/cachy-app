
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

impl Default for RsiSettings { fn default() -> Self { Self { length: 14 } } }
impl Default for MacdSettings { fn default() -> Self { Self { fastLength: 12, slowLength: 26, signalLength: 9 } } }
impl Default for BbSettings { fn default() -> Self { Self { length: 20, stdDev: 2.0 } } }

fn default_zero() -> usize { 0 }
fn default_rsi_len() -> usize { 14 }
fn default_macd_fast() -> usize { 12 }
fn default_macd_slow() -> usize { 26 }
fn default_macd_sig() -> usize { 9 }
fn default_bb_len() -> usize { 20 }
fn default_bb_std() -> f64 { 2.0 }

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

#[wasm_bindgen]
pub struct TechnicalsCalculator {
    ema_states: HashMap<usize, EmaState>,
    rsi_states: HashMap<usize, RsiState>,
    macd_states: HashMap<String, MacdState>, // Key: "12,26,9"
    bb_states: HashMap<String, BbState>,     // Key: "20,2"
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
            last_close: 0.0,
        }
    }

    pub fn initialize(&mut self, closes: &[f64], settings_json: &str) {
        if closes.is_empty() { return; }
        self.last_close = closes[closes.len() - 1];

        // Parse Settings
        let settings: IndicatorSettings = serde_json::from_str(settings_json).unwrap_or_default();

        // 1. EMA
        let mut ema_periods = Vec::new();
        if settings.ema.ema1.length > 0 { ema_periods.push(settings.ema.ema1.length); }
        if settings.ema.ema2.length > 0 { ema_periods.push(settings.ema.ema2.length); }
        if settings.ema.ema3.length > 0 { ema_periods.push(settings.ema.ema3.length); }
        // Add defaults if none configured? No, adhere to settings.
        // If settings are empty, we do nothing.
        // JS side defaults to 20/50/200 if not set.
        // We assume settings_json passed contains defaults if UI didn't set them.

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
                std_dev_mult: bb_std,
            });
        }
    }

    pub fn update(&mut self, price: f64) -> JsValue {
        let mut result = String::from("{");

        // --- EMA ---
        result.push_str("\"movingAverages\": [");
        for (period, state) in &mut self.ema_states {
            let new_val = update_ema_calc(state.prev_ema, price, *period);
            result.push_str(&format!("{{\"name\":\"EMA\",\"params\":\"{}\",\"value\":{},\"action\":\"Neutral\"}},", period, new_val));
        }
        if result.ends_with(',') { result.pop(); }
        result.push_str("],");

        // --- Oscillators ---
        result.push_str("\"oscillators\": [");

        // RSI
        for (period, state) in &mut self.rsi_states {
            let (rsi, _, _) = update_rsi_calc(state.avg_gain, state.avg_loss, price, state.prev_price, *period);
            let action = if rsi > 70.0 { "Sell" } else if rsi < 30.0 { "Buy" } else { "Neutral" };
            result.push_str(&format!("{{\"name\":\"RSI\",\"params\":\"{}\",\"value\":{},\"action\":\"{}\"}},", period, rsi, action));
        }

        // MACD
        for (key, state) in &mut self.macd_states {
            let parts: Vec<&str> = key.split(',').collect();
            let fast_len: usize = parts[0].parse().unwrap();
            let slow_len: usize = parts[1].parse().unwrap();
            let sig_len: usize = parts[2].parse().unwrap();

            let new_fast = update_ema_calc(state.fast_ema, price, fast_len);
            let new_slow = update_ema_calc(state.slow_ema, price, slow_len);
            let new_macd_line = new_fast - new_slow;
            let new_signal = update_ema_calc(state.signal_ema, new_macd_line, sig_len);
            let hist = new_macd_line - new_signal;

            let action = if new_macd_line > new_signal { "Buy" } else { "Sell" };

            result.push_str(&format!("{{\"name\":\"MACD\",\"params\":\"{}\",\"value\":{},\"signal\":{},\"histogram\":{},\"action\":\"{}\"}},",
                key.replace(',', ", "), new_macd_line, new_signal, hist, action));
        }

        if result.ends_with(',') { result.pop(); }
        result.push_str("],");

        // --- Volatility (BB) ---
        result.push_str("\"volatility\": {");
        if let Some(state) = self.bb_states.values().next() {
             let len = state.history.len();
             let old_val = state.history[state.history_idx];
             let new_sum = state.prev_sum - old_val + price;
             let new_sma = new_sum / (len as f64);

             let mut sum_sq_diff = 0.0;
             for (i, val) in state.history.iter().enumerate() {
                 let v = if i == state.history_idx { price } else { *val };
                 sum_sq_diff += (v - new_sma).powi(2);
             }
             let std_dev = (sum_sq_diff / (len as f64)).sqrt();

             let upper = new_sma + state.std_dev_mult * std_dev;
             let lower = new_sma - state.std_dev_mult * std_dev;
             let percent_p = if upper - lower == 0.0 { 0.5 } else { (price - lower) / (upper - lower) };

             result.push_str(&format!("\"bb\": {{\"middle\":{},\"upper\":{},\"lower\":{},\"percentP\":{}}},", new_sma, upper, lower, percent_p));
             result.push_str(&format!("\"atr\": 0.0"));
        } else {
             result.push_str("\"atr\": 0.0");
        }
        result.push_str("}"); // End volatility

        // Summary (Mocked)
        result.push_str(", \"summary\": {\"buy\":0,\"sell\":0,\"neutral\":0,\"action\":\"Neutral\"}");

        result.push_str("}");
        JsValue::from_str(&result)
    }
}

// --- Pure Calculation Helpers ---

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
