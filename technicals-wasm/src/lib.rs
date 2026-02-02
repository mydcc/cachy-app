
mod utils;

use wasm_bindgen::prelude::*;

// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
// allocator.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

// Helper to log from Rust
macro_rules! console_log {
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

#[wasm_bindgen]
pub struct TechnicalsCalculator {
    // We can store state here
    // For now, let's just expose static-like functions or simple state
}

#[wasm_bindgen]
impl TechnicalsCalculator {
    #[wasm_bindgen(constructor)]
    pub fn new() -> TechnicalsCalculator {
        TechnicalsCalculator {}
    }

    pub fn update_ema(&self, prev: f64, val: f64, period: usize) -> f64 {
        let k = 2.0 / ((period + 1) as f64);
        (val - prev) * k + prev
    }

    pub fn update_sma(&self, prev_sma: f64, new_val: f64, old_val: f64, period: usize) -> f64 {
        prev_sma + (new_val - old_val) / (period as f64)
    }

    // RSI State return struct?
    // WasmBindgen doesn't support returning complex structs easily without definition.
    // We can return a JsValue (Object) or a simple array.
}

#[wasm_bindgen]
pub fn calculate_ema(data: &[f64], period: usize) -> Vec<f64> {
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
