
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

// Simple structs to hold state
struct EmaState {
    prev_ema: f64,
}

struct RsiState {
    avg_gain: f64,
    avg_loss: f64,
    prev_price: f64,
}

#[wasm_bindgen]
pub struct TechnicalsCalculator {
    ema_states: HashMap<usize, EmaState>,
    rsi_states: HashMap<usize, RsiState>,
    last_close: f64,
}

#[wasm_bindgen]
impl TechnicalsCalculator {
    #[wasm_bindgen(constructor)]
    pub fn new() -> TechnicalsCalculator {
        TechnicalsCalculator {
            ema_states: HashMap::new(),
            rsi_states: HashMap::new(),
            last_close: 0.0,
        }
    }

    // Initialize with a simple array of closes for now to keep it simple
    pub fn initialize(&mut self, closes: &[f64], settings_json: &str) {
        // Parse settings (mocked for now, assumes default periods if not parsed)
        // In real impl, use serde_json. For now, we manually set up standard periods.
        // Let's assume standard periods: EMA 10, 20, 50, 200. RSI 14.

        if closes.is_empty() { return; }
        self.last_close = closes[closes.len() - 1];

        // Init EMA 20 (Simulated)
        let period = 20;
        let val = calculate_ema_last(closes, period);
        self.ema_states.insert(period, EmaState { prev_ema: val });

        // Init RSI 14
        let rsi_period = 14;
        let (avg_gain, avg_loss) = calculate_rsi_state(closes, rsi_period);
        self.rsi_states.insert(rsi_period, RsiState {
            avg_gain,
            avg_loss,
            prev_price: self.last_close
        });
    }

    pub fn update(&mut self, price: f64) -> JsValue {
        // Return a simple object with results
        // Since we can't easily return a complex struct without defining it in JS or using Serde,
        // we return a Map or Object.

        let mut result = String::from("{");

        // Update EMA 20
        if let Some(state) = self.ema_states.get(&20) {
            let new_val = self.update_ema_internal(state.prev_ema, price, 20);
            result.push_str(&format!("\"ema20\": {},", new_val));
        }

        // Update RSI 14
        if let Some(state) = self.rsi_states.get(&14) {
            let (new_rsi, _, _) = self.update_rsi_internal(state.avg_gain, state.avg_loss, price, state.prev_price, 14);
            result.push_str(&format!("\"rsi14\": {}", new_rsi));
        } else {
             // remove trailing comma if RSI missing
             if result.ends_with(',') { result.pop(); }
        }

        result.push_str("}");

        JsValue::from_str(&result)
    }

    // Internal Helpers
    fn update_ema_internal(&self, prev: f64, val: f64, period: usize) -> f64 {
        let k = 2.0 / ((period + 1) as f64);
        (val - prev) * k + prev
    }

    fn update_rsi_internal(&self, avg_gain: f64, avg_loss: f64, current: f64, prev: f64, period: usize) -> (f64, f64, f64) {
        let diff = current - prev;
        let gain = if diff > 0.0 { diff } else { 0.0 };
        let loss = if diff < 0.0 { -diff } else { 0.0 };

        let new_avg_gain = (avg_gain * ((period - 1) as f64) + gain) / (period as f64);
        let new_avg_loss = (avg_loss * ((period - 1) as f64) + loss) / (period as f64);

        let rsi = if new_avg_loss == 0.0 {
            100.0
        } else {
            100.0 - 100.0 / (1.0 + new_avg_gain / new_avg_loss)
        };

        (rsi, new_avg_gain, new_avg_loss)
    }
}

// Helpers
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

fn calculate_rsi_state(data: &[f64], period: usize) -> (f64, f64) {
    // Need to calc avg_gain/loss at end
    // Simplified: assume we have enough data
    if data.len() <= period { return (0.0, 0.0); }

    let mut avg_gain = 0.0;
    let mut avg_loss = 0.0;

    // First
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
