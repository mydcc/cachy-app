
mod utils;

use wasm_bindgen::prelude::*;
use std::collections::HashMap;

#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

// State Structs
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
    // Ring buffer for calculating StdDev
    history: Vec<f64>,
    history_idx: usize,
    prev_sum: f64,
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

        // --- Defaults (Should parse settings_json in production) ---
        // EMA
        let ema_periods = vec![10, 20, 50, 200];
        for p in ema_periods {
            let val = calculate_ema_last(closes, p);
            self.ema_states.insert(p, EmaState { prev_ema: val });
        }

        // RSI
        let rsi_p = 14;
        let (avg_gain, avg_loss) = calculate_rsi_state(closes, rsi_p);
        self.rsi_states.insert(rsi_p, RsiState { avg_gain, avg_loss, prev_price: self.last_close });

        // MACD (12, 26, 9)
        let fast = 12;
        let slow = 26;
        let sig = 9;
        // Calc initial state
        let fast_val = calculate_ema_last(closes, fast);
        let slow_val = calculate_ema_last(closes, slow);
        // Signal line needs history of MACD line. Hard to get exact 1-point state without replay.
        // Simplification: Assume signal matches MACD current initially (convergence) or replay last N.
        // Better: Replay last 'sig' points of MACD line to seed Signal EMA.
        let signal_val = calculate_macd_signal_last(closes, fast, slow, sig);

        self.macd_states.insert(format!("{},{},{}", fast, slow, sig), MacdState {
            fast_ema: fast_val,
            slow_ema: slow_val,
            signal_ema: signal_val
        });

        // Bollinger Bands (20, 2)
        let bb_len = 20;
        let bb_std = 2.0;
        if closes.len() >= bb_len {
            // Init Ring Buffer
            let start = closes.len() - bb_len;
            let history = closes[start..].to_vec();
            let sum: f64 = history.iter().sum();

            self.bb_states.insert(format!("{},{}", bb_len, bb_std), BbState {
                history,
                history_idx: 0, // Points to oldest element (implied ring start is 0 after copy?)
                // Actually, if we copy the last N, the "next" write should be at index 0 (overwriting the oldest).
                // Yes.
                prev_sum: sum
            });
        }
    }

    pub fn update(&mut self, price: f64) -> JsValue {
        let mut result = String::from("{");

        // --- EMA ---
        result.push_str("\"movingAverages\": [");
        for (period, state) in &mut self.ema_states {
            let new_val = update_ema_calc(state.prev_ema, price, *period);
            // Don't update state here?
            // NOTE: "update" in this context is usually "Intra-candle update".
            // The state should remain at "Last Closed Candle".
            // So we calculate new_val but don't save it to state.prev_ema.
            // CORRECT.
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
        // Only one BB supported in UI typically
        if let Some(state) = self.bb_states.values().next() {
             // BB update
             // We need to replace the oldest value with current price to calc SMA and StdDev
             // But we don't mutate state.
             let len = state.history.len();
             let old_val = state.history[state.history_idx]; // This is the oldest value
             let new_sum = state.prev_sum - old_val + price;
             let new_sma = new_sum / (len as f64);

             // StdDev
             let mut sum_sq_diff = 0.0;
             for (i, val) in state.history.iter().enumerate() {
                 let v = if i == state.history_idx { price } else { *val };
                 sum_sq_diff += (v - new_sma).powi(2);
             }
             let std_dev = (sum_sq_diff / (len as f64)).sqrt();
             let upper = new_sma + 2.0 * std_dev;
             let lower = new_sma - 2.0 * std_dev;
             let percent_p = if upper - lower == 0.0 { 0.5 } else { (price - lower) / (upper - lower) };

             result.push_str(&format!("\"bb\": {{\"middle\":{},\"upper\":{},\"lower\":{},\"percentP\":{}}},", new_sma, upper, lower, percent_p));
             result.push_str(&format!("\"atr\": 0.0")); // Placeholder
        } else {
             // Empty volatilty to match structure
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

    // We can't reuse calculate_ema_last easily for series.
    // Let's implement full MACD series calc here for init.

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
