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

use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::collections::VecDeque;

#[derive(Serialize, Deserialize, Default)]
pub struct IndicatorSettings {
    #[serde(default)] pub ema: Vec<EmaSettings>,
    #[serde(default)] pub sma: Vec<SmaSettings>,
    #[serde(default)] pub wma: Vec<WmaSettings>,
    #[serde(default)] pub vwma: Vec<VwmaSettings>,
    #[serde(default)] pub hma: Vec<HmaSettings>,
    #[serde(default)] pub rsi: Vec<RsiSettings>,
    #[serde(default)] pub macd: Vec<MacdSettings>,
    #[serde(default)] pub bb: Vec<BbSettings>,
    #[serde(default)] pub atr: Vec<AtrSettings>,
    #[serde(default)] pub stoch: Vec<StochSettings>,
    #[serde(default)] pub cci: Vec<CciSettings>,
    #[serde(default)] pub adx: Vec<AdxSettings>,
    #[serde(default)] pub supertrend: Vec<SuperTrendSettings>,
    #[serde(default)] pub mom: Vec<MomSettings>,
    #[serde(default)] pub wr: Vec<WrSettings>,
    #[serde(default)] pub volma: Vec<VolMaSettings>,
    #[serde(default)] pub pivots: Vec<PivotSettings>,
    #[serde(default)] pub psar: Vec<PsarSettings>,
    #[serde(default)] pub chop: Vec<ChopSettings>,
    #[serde(default)] pub vwap: Vec<VwapSettings>,
    #[serde(default)] pub mfi: Vec<MfiSettings>,
}

#[derive(Serialize, Deserialize, Clone, Default)] pub struct EmaSettings { pub length: usize }
#[derive(Serialize, Deserialize, Clone, Default)] pub struct SmaSettings { pub length: usize }
#[derive(Serialize, Deserialize, Clone, Default)] pub struct WmaSettings { pub length: usize }
#[derive(Serialize, Deserialize, Clone, Default)] pub struct VwmaSettings { pub length: usize }
#[derive(Serialize, Deserialize, Clone, Default)] pub struct HmaSettings { pub length: usize }
#[derive(Serialize, Deserialize, Clone, Default)] pub struct RsiSettings { pub length: usize }
#[derive(Serialize, Deserialize, Clone, Default)] pub struct MacdSettings { pub fast: usize, pub slow: usize, pub signal: usize }
#[derive(Serialize, Deserialize, Clone, Default)] pub struct BbSettings { pub length: usize, pub std_dev: f64 }
#[derive(Serialize, Deserialize, Clone, Default)] pub struct AtrSettings { pub length: usize }
#[derive(Serialize, Deserialize, Clone, Default)] pub struct StochSettings { pub k: usize, pub d: usize, pub smooth: usize }
#[derive(Serialize, Deserialize, Clone, Default)] pub struct CciSettings { pub length: usize }
#[derive(Serialize, Deserialize, Clone, Default)] pub struct AdxSettings { pub length: usize }
#[derive(Serialize, Deserialize, Clone, Default)] pub struct SuperTrendSettings { pub length: usize, pub multiplier: f64 }
#[derive(Serialize, Deserialize, Clone, Default)] pub struct MomSettings { pub length: usize }
#[derive(Serialize, Deserialize, Clone, Default)] pub struct WrSettings { pub length: usize }
#[derive(Serialize, Deserialize, Clone, Default)] pub struct VolMaSettings { pub length: usize }
#[derive(Serialize, Deserialize, Clone, Default)] pub struct PivotSettings { pub type_: String }
#[derive(Serialize, Deserialize, Clone, Default)] pub struct PsarSettings { pub start: f64, pub increment: f64, pub max: f64 }
#[derive(Serialize, Deserialize, Clone, Default)] pub struct ChopSettings { pub length: usize }
#[derive(Serialize, Deserialize, Clone, Default)] pub struct VwapSettings { pub anchor: String }
#[derive(Serialize, Deserialize, Clone, Default)] pub struct MfiSettings { pub length: usize }

struct EmaState { k: f64, value: f64, initialized: bool }
struct SmaState { sum: f64, initialized: bool }
struct WmaState { sum: f64, initialized: bool }
struct VwmaState { sum_pv: f64, sum_vol: f64, initialized: bool }
struct HmaState { wma_half: f64, wma_full: f64, _sqrt_wma: f64, initialized: bool }
struct RsiState { avg_gain: f64, avg_loss: f64, prev_close: f64, initialized: bool }
struct MacdState { ema_fast: f64, ema_slow: f64, signal_val: f64, k_fast: f64, k_slow: f64, k_signal: f64, initialized: bool }
struct BbState { sum: f64, sum_sq: f64, std_dev_mult: f64, initialized: bool }
struct AtrState { value: f64, prev_close: f64, initialized: bool }
struct StochState { k_buffer: VecDeque<f64>, d_val: f64, k_len: usize, d_len: usize, initialized: bool }
struct MomState { initialized: bool }
struct WrState { initialized: bool }
struct VolMaState { sum: f64, initialized: bool }

#[allow(dead_code)]
struct CciState { tp_buffer: VecDeque<f64>, sum_tp: f64, initialized: bool }
#[allow(dead_code)]
struct AdxState { tr_smooth: f64, pdm_smooth: f64, ndm_smooth: f64, dx_smooth: f64, prev_high: f64, prev_low: f64, prev_close: f64, initialized: bool }
#[allow(dead_code)]
struct SuperTrendState { atr: f64, upper: f64, lower: f64, trend: i32, prev_close: f64, initialized: bool, multiplier: f64 }
#[allow(dead_code)]
struct ChopState { highs: VecDeque<f64>, lows: VecDeque<f64>, tr_buffer: VecDeque<f64>, sum_tr: f64, prev_close: f64, initialized: bool }
#[allow(dead_code)]
struct MfiState { pos_flow: VecDeque<f64>, neg_flow: VecDeque<f64>, sum_p: f64, sum_n: f64, prev_tp: f64, initialized: bool }
#[allow(dead_code)]
struct VwapState { cum_vol: f64, cum_pv: f64, last_t: f64 }
#[allow(dead_code)]
#[derive(Default, Clone, Copy)] pub struct PivotState { pub p: f64, pub r1: f64, pub r2: f64, pub r3: f64, pub s1: f64, pub s2: f64, pub s3: f64, pub basis_h: f64, pub basis_l: f64, pub basis_c: f64, pub basis_o: f64, initialized: bool }
#[allow(dead_code)]
#[derive(Default, Clone, Copy)] pub struct PsarState { pub sar: f64, pub ep: f64, pub af: f64, pub is_long: bool, pub max_af: f64, pub inc_af: f64, pub prev_high: f64, pub prev_low: f64, initialized: bool }

#[derive(Serialize)]
struct OutputData {
    #[serde(rename = "movingAverages")] moving_averages: HashMap<String, f64>,
    oscillators: HashMap<String, f64>,
    volatility: HashMap<String, f64>,
    pivots: HashMap<String, f64>,
}

#[wasm_bindgen]
pub struct TechnicalsCalculator {
    settings: IndicatorSettings,
    
    // Global Price History Buffers (Shared Memory)
    // Max 200 candles for all indicators
    price_history_closes: VecDeque<f64>,
    price_history_highs: VecDeque<f64>,
    price_history_lows: VecDeque<f64>,
    price_history_volumes: VecDeque<f64>,
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
    #[allow(dead_code)]
    mfi_states: HashMap<usize, MfiState>,
    #[allow(dead_code)]
    vwap_states: HashMap<String, VwapState>,
    #[allow(dead_code)]
    psar_states: HashMap<String, PsarState>,
    #[allow(dead_code)]
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
            
            ema_states: HashMap::new(), sma_states: HashMap::new(), wma_states: HashMap::new(), 
            vwma_states: HashMap::new(), hma_states: HashMap::new(),
            rsi_states: HashMap::new(), macd_states: HashMap::new(), bb_states: HashMap::new(),
            atr_states: HashMap::new(), stoch_states: HashMap::new(), mom_states: HashMap::new(), wr_states: HashMap::new(),
            volma_states: HashMap::new(), cci_states: HashMap::new(), adx_states: HashMap::new(), st_states: HashMap::new(),
            chop_states: HashMap::new(), mfi_states: HashMap::new(), vwap_states: HashMap::new(), psar_states: HashMap::new(),
            pivots_state: PivotState::default(),
        }
    }

    pub fn initialize(&mut self, closes: &[f64], highs: &[f64], lows: &[f64], volumes: &[f64], _times: &[f64], settings_json: &str) {
        self.settings = serde_json::from_str(settings_json).unwrap_or_default();
        let len = closes.len();
        if len == 0 { return; }

        // Initialize global price history buffers
        // Store last N candles (max 200)
        let start_idx = if len > self.max_history_size { len - self.max_history_size } else { 0 };
        for i in start_idx..len {
            self.price_history_closes.push_back(closes[i]);
            self.price_history_highs.push_back(highs[i]);
            self.price_history_lows.push_back(lows[i]);
            self.price_history_volumes.push_back(volumes[i]);
        }

        // --- Core Init (Condensed) ---
        for s in &self.settings.ema {
            let k = 2.0 / (s.length as f64 + 1.0);
            let mut val = closes[0]; let mut init = false;
            if len >= s.length { val = closes[0..s.length].iter().sum::<f64>() / s.length as f64; for &p in &closes[s.length..] { val = (p - val) * k + val; } init = true; }
            self.ema_states.insert(s.length, EmaState { k, value: val, initialized: init });
        }
        
        // SMA Init
        for s in &self.settings.sma {
            let mut sum = 0.0; let mut init = false;
            if len >= s.length {
                for &p in &closes[len - s.length..] { sum += p; }
                init = true;
            }
            self.sma_states.insert(s.length, SmaState { sum, initialized: init });
        }
        
        // WMA Init (Weighted Moving Average)
        for s in &self.settings.wma {
            let mut sum = 0.0; let mut init = false;
            if len >= s.length {
                let weights_sum = (s.length * (s.length + 1)) / 2;
                for i in 0..s.length {
                    sum += closes[len - s.length + i] * (i + 1) as f64;
                }
                sum /= weights_sum as f64;
                init = true;
            }
            self.wma_states.insert(s.length, WmaState { sum, initialized: init });
        }
        
        // VWMA Init (Volume-Weighted Moving Average)
        for s in &self.settings.vwma {
            let mut sum_pv = 0.0; let mut sum_vol = 0.0; let mut init = false;
            if len >= s.length {
                for i in (len - s.length)..len {
                    sum_pv += closes[i] * volumes[i];
                    sum_vol += volumes[i];
                }
                init = true;
            }
            self.vwma_states.insert(s.length, VwmaState { sum_pv, sum_vol, initialized: init });
        }
        
        // HMA Init (Hull Moving Average) - WMA(2*WMA(n/2) - WMA(n), sqrt(n))
        for s in &self.settings.hma {
            let half_len = s.length / 2;
            let sqrt_len = (s.length as f64).sqrt() as usize;
            let mut wma_half = 0.0; let mut wma_full = 0.0; let mut _sqrt_wma = 0.0; let mut init = false;
            
            if len >= s.length + sqrt_len {
                // Calculate WMA(n/2)
                let weights_half = (half_len * (half_len + 1)) / 2;
                for i in 0..half_len {
                    wma_half += closes[len - half_len + i] * (i + 1) as f64;
                }
                wma_half /= weights_half as f64;
                
                // Calculate WMA(n)
                let weights_full = (s.length * (s.length + 1)) / 2;
                for i in 0..s.length {
                    wma_full += closes[len - s.length + i] * (i + 1) as f64;
                }
                wma_full /= weights_full as f64;
                
                init = true;
            }
            self.hma_states.insert(s.length, HmaState { wma_half, wma_full, _sqrt_wma, initialized: init });
        }
        
        for s in &self.settings.rsi {
            let mut avg_gain = 0.0; let mut avg_loss = 0.0; let mut prev = closes[0]; let mut init = false;
            if len > s.length {
                for i in 1..=s.length { let chg = closes[i] - closes[i-1]; if chg > 0.0 { avg_gain += chg; } else { avg_loss -= chg; } }
                avg_gain /= s.length as f64; avg_loss /= s.length as f64;
                for i in (s.length+1)..len { let chg = closes[i] - closes[i-1]; let g = if chg > 0.0 { chg } else { 0.0 }; let l = if chg < 0.0 { -chg } else { 0.0 }; avg_gain = (avg_gain * (s.length as f64 - 1.0) + g) / s.length as f64; avg_loss = (avg_loss * (s.length as f64 - 1.0) + l) / s.length as f64; }
                prev = closes[len-1]; init = true;
            }
            self.rsi_states.insert(s.length, RsiState { avg_gain, avg_loss, prev_close: prev, initialized: init });
        }
        for s in &self.settings.macd {
             let k_f = 2.0 / (s.fast as f64 + 1.0); let k_s = 2.0 / (s.slow as f64 + 1.0); let k_sig = 2.0 / (s.signal as f64 + 1.0);
             let mut init = false; let mut ef = 0.0; let mut es = 0.0; let mut sv = 0.0;
             if len > s.slow + s.signal {
                 ef = closes[0]; es = closes[0]; for &p in closes.iter() { ef = (p - ef) * k_f + ef; es = (p - es) * k_s + es; sv = ((ef - es) - sv) * k_sig + sv; } init = true;
             }
             self.macd_states.insert(format!("{}-{}-{}", s.fast, s.slow, s.signal), MacdState { ema_fast: ef, ema_slow: es, signal_val: sv, k_fast: k_f, k_slow: k_s, k_signal: k_sig, initialized: init });
        }
        for s in &self.settings.bb {
             let mut sum = 0.0; let mut sum_sq = 0.0; let mut init = false;
             if len >= s.length { 
                 for &p in &closes[len - s.length..] { sum += p; sum_sq += p * p; } 
                 init = true; 
             }
             self.bb_states.insert(s.length, BbState { sum, sum_sq, std_dev_mult: s.std_dev, initialized: init });
        }
        for s in &self.settings.atr {
             let mut val = 0.0; let mut init = false;
             if len > s.length {
                 let mut tr_sum = 0.0; for i in 1..=s.length { let h = highs[i]; let l = lows[i]; let pc = closes[i-1]; tr_sum += (h - l).max((h - pc).abs()).max((l - pc).abs()); }
                 val = tr_sum / s.length as f64;
                 for i in (s.length+1)..len { let h = highs[i]; let l = lows[i]; let pc = closes[i-1]; val = (val * (s.length as f64 - 1.0) + (h - l).max((h - pc).abs()).max((l - pc).abs())) / s.length as f64; }
                 init = true;
             }
             self.atr_states.insert(s.length, AtrState { value: val, prev_close: closes[len-1], initialized: init });
        }
        for s in &self.settings.stoch {
             let mut k_buf = VecDeque::new(); let mut init = false; let mut d_val = 0.0;
             if len >= s.k + s.smooth {
                 for i in 0..len {
                     if i >= s.k - 1 {
                         // Find MaxH and MinL over last K periods
                         let start = i + 1 - s.k;
                         // Optimization: Slice is faster than iter loop if possible, but VecDeque doesn't slice easily.
                         // Using manual loop for now or global buffers? Init uses slice 'highs'.
                         let mut max_h = f64::MIN; let mut min_l = f64::MAX;
                         for j in start..=i { max_h = max_h.max(highs[j]); min_l = min_l.min(lows[j]); }
                         
                         let k = if max_h == min_l { 50.0 } else { (closes[i] - min_l) / (max_h - min_l) * 100.0 };
                         k_buf.push_back(k); if k_buf.len() > s.d { k_buf.pop_front(); }
                         if k_buf.len() == s.d { d_val = k_buf.iter().sum::<f64>() / s.d as f64; }
                     }
                 }
                 init = true;
             }
             self.stoch_states.insert(format!("{}-{}-{}", s.k, s.d, s.smooth), StochState { k_buffer: k_buf, d_val, k_len: s.k, d_len: s.d, initialized: init });
        }

        // CCI Init
        for s in &self.settings.cci {
            let mut tp_buf = VecDeque::new(); let mut init = false; let mut sum_tp = 0.0;
            if len >= s.length {
                for i in 0..len {
                    let tp = (highs[i] + lows[i] + closes[i]) / 3.0;
                    tp_buf.push_back(tp); sum_tp += tp;
                    if tp_buf.len() > s.length { sum_tp -= tp_buf.pop_front().unwrap(); }
                }
                init = true;
            }
            self.cci_states.insert(s.length, CciState { tp_buffer: tp_buf, sum_tp, initialized: init });
        }

        // Advanced Init
        for s in &self.settings.mom {
            let init = len > s.length;
            self.mom_states.insert(s.length, MomState { initialized: init });
        }
        for s in &self.settings.volma {
            let mut sum = 0.0; let mut init = false;
            if len >= s.length { for &v in &volumes[len - s.length ..] { sum += v; } init = true; }
            self.volma_states.insert(s.length, VolMaState { sum, initialized: init });
        }
        for s in &self.settings.wr {
            let init = len >= s.length;
            self.wr_states.insert(s.length, WrState { initialized: init });
        }
        
        // ADX Init
        for s in &self.settings.adx {
            // Simplified ADX Init: Needs at least 2*length? Standard ADX needs some history to stabilize.
            // Using standard Wilder's smoothing initialization.
            let mut tr_smooth = 0.0; let mut pdm_smooth = 0.0; let mut ndm_smooth = 0.0; 
            let mut dx_smooth = 0.0; let mut init = false;
            let mut prev_h = highs[0]; let mut prev_l = lows[0]; let mut prev_c = closes[0];
            
            if len > s.length * 2 { // ADX needs more history
                 // 1. Initial SMA for first Length periods
                 let mut tr_sum = 0.0; let mut pdm_sum = 0.0; let mut ndm_sum = 0.0;
                 for i in 1..=s.length {
                     let h = highs[i]; let l = lows[i]; let pc = closes[i-1];
                     let tr = (h - l).max((h - pc).abs()).max((l - pc).abs());
                     let up = h - highs[i-1]; let down = lows[i-1] - l;
                     let pdm = if up > down && up > 0.0 { up } else { 0.0 };
                     let ndm = if down > up && down > 0.0 { down } else { 0.0 };
                     tr_sum += tr; pdm_sum += pdm; ndm_sum += ndm;
                 }
                 tr_smooth = tr_sum; pdm_smooth = pdm_sum; ndm_smooth = ndm_sum; // First value is sum (or average? Wilder says sum for first?)
                 // Actually Wilder's usually starts with SMA.
                 // Let's use Average.
                 tr_smooth /= s.length as f64; pdm_smooth /= s.length as f64; ndm_smooth /= s.length as f64;

                 // 2. Smoothing loop
                 let _dx_sum = 0.0;
                 for i in (s.length+1)..len {
                     let h = highs[i]; let l = lows[i]; let pc = closes[i-1];
                     let tr = (h - l).max((h - pc).abs()).max((l - pc).abs());
                     let up = h - highs[i-1]; let down = lows[i-1] - l;
                     let pdm = if up > down && up > 0.0 { up } else { 0.0 };
                     let ndm = if down > up && down > 0.0 { down } else { 0.0 };
                     
                     tr_smooth = (tr_smooth * (s.length as f64 - 1.0) + tr) / s.length as f64;
                     pdm_smooth = (pdm_smooth * (s.length as f64 - 1.0) + pdm) / s.length as f64;
                     ndm_smooth = (ndm_smooth * (s.length as f64 - 1.0) + ndm) / s.length as f64;
                     
                     let pdi = 100.0 * pdm_smooth / tr_smooth;
                     let ndi = 100.0 * ndm_smooth / tr_smooth;
                     let di_sum = pdi + ndi;
                     let dx = if di_sum == 0.0 { 0.0 } else { 100.0 * (pdi - ndi).abs() / di_sum };
                     
                     // ADX Smoothing: ADX is EMA/RMA of DX? Usually RMA.
                     // But we need to accumulate DX to get first ADX.
                     // Let's just track ADX via smoothing: adx = (adx * (n-1) + dx) / n
                     if i == s.length * 2 - 1 {
                         dx_smooth = dx;
                     } else if i >= s.length * 2 {
                         dx_smooth = (dx_smooth * (s.length as f64 - 1.0) + dx) / s.length as f64;
                     }
                 }
                 init = true;
                 prev_h = highs[len-1]; prev_l = lows[len-1]; prev_c = closes[len-1];
            }
            self.adx_states.insert(s.length, AdxState { tr_smooth, pdm_smooth, ndm_smooth, dx_smooth, prev_high: prev_h, prev_low: prev_l, prev_close: prev_c, initialized: init });
        }

        // SuperTrend Init
        for s in &self.settings.supertrend {
             let _tr_val = 0.0; let mut atr = 0.0; 
             let mut upper = 0.0; let mut lower = 0.0; 
             let mut final_upper; let mut final_lower;
             let mut trend = 1;
             let mut init = false;
             
             if len > s.length {
                 // 1. Calculate initial ATR over first 'length' candles
                 let mut tr_sum = 0.0;
                 for i in 1..=s.length {
                     let h = highs[i]; let l = lows[i]; let pc = closes[i-1];
                     let tr = (h - l).max((h - pc).abs()).max((l - pc).abs());
                     tr_sum += tr;
                 }
                 atr = tr_sum / s.length as f64;
                 
                 // Initial Bands
                 let h = highs[s.length]; let l = lows[s.length];
                 let basic_upper = (h + l) / 2.0 + s.multiplier * atr;
                 let basic_lower = (h + l) / 2.0 - s.multiplier * atr;
                 final_upper = basic_upper;
                 final_lower = basic_lower;
                 
                 // 2. Replay history to establish trend
                 for i in (s.length+1)..len {
                     let h = highs[i]; let l = lows[i]; let c = closes[i]; let pc = closes[i-1];
                     let tr = (h - l).max((h - pc).abs()).max((l - pc).abs());
                     
                     // RMA for ATR in SuperTrend? Or SMA? TradingView uses RMA.
                     atr = (atr * (s.length as f64 - 1.0) + tr) / s.length as f64;
                     
                     let basic_upper = (h + l) / 2.0 + s.multiplier * atr;
                     let basic_lower = (h + l) / 2.0 - s.multiplier * atr;
                     
                     if basic_upper < final_upper || pc > final_upper { final_upper = basic_upper; }
                     if basic_lower > final_lower || pc < final_lower { final_lower = basic_lower; }
                     
                     let prev_trend = trend;
                     if prev_trend == 1 {
                         if c < final_lower { trend = -1; }
                     } else {
                         if c > final_upper { trend = 1; }
                     }
                 }
                 upper = final_upper; lower = final_lower;
                 init = true;
             }
             self.st_states.insert(format!("{}-{}", s.length, s.multiplier), SuperTrendState { atr, upper, lower, trend, prev_close: closes[len-1], initialized: init, multiplier: s.multiplier });
        }
        
        // Chop Init
        for s in &self.settings.chop {
            let mut tr_buffer = VecDeque::new();
            let mut high_buffer = VecDeque::new(); // Store recent highs
            let mut low_buffer = VecDeque::new(); // Store recent lows
            let mut sum_tr = 0.0;
            let mut init = false;
            
            if len > s.length {
                // Pre-fill buffers
                let start_idx = len - s.length;
                for i in start_idx..len {
                     let h = highs[i]; let l = lows[i]; let pc = closes[i-1];
                     let tr = (h - l).max((h - pc).abs()).max((l - pc).abs());
                     tr_buffer.push_back(tr);
                     sum_tr += tr;
                     high_buffer.push_back(h);
                     low_buffer.push_back(l);
                }
                init = true;
            }
            self.chop_states.insert(s.length, ChopState { highs: high_buffer, lows: low_buffer, tr_buffer, sum_tr, prev_close: closes[len-1], initialized: init });
        }
    }

    pub fn update(&self, _o: f64, h: f64, l: f64, c: f64, v: f64, _t: f64) -> String {
        let mut out = OutputData {
            moving_averages: HashMap::new(), oscillators: HashMap::new(), volatility: HashMap::new(), pivots: HashMap::new(),
        };

        // ... Core Updates ...
        for (len, s) in &self.ema_states { if s.initialized { out.moving_averages.insert(format!("EMA{}", len), (c - s.value) * s.k + s.value); }}
        
        // SMA Update
        for (len, s) in &self.sma_states { 
            if s.initialized && self.price_history_closes.len() >= *len {
                let old = self.price_history_closes[self.price_history_closes.len() - *len];
                out.moving_averages.insert(format!("SMA{}", len), (s.sum - old + c) / *len as f64);
            }
        }
        
        // WMA Update
        for (len, s) in &self.wma_states {
            if s.initialized && self.price_history_closes.len() >= *len {
                let weights_sum = (*len * (*len + 1)) / 2;
                let mut wma = 0.0;
                for i in 0..*len {
                    let idx = self.price_history_closes.len() - *len + i;
                    wma += self.price_history_closes[idx] * (i + 1) as f64;
                }
                wma = (wma + c * (*len + 1) as f64 - self.price_history_closes[self.price_history_closes.len() - *len] * (*len) as f64) / weights_sum as f64;
                out.moving_averages.insert(format!("WMA{}", len), wma);
            }
        }
        
        // VWMA Update
        for (len, s) in &self.vwma_states {
            if s.initialized && self.price_history_closes.len() >= *len && self.price_history_volumes.len() >= *len {
                let old_close = self.price_history_closes[self.price_history_closes.len() - *len];
                let old_vol = self.price_history_volumes[self.price_history_volumes.len() - *len];
                let new_sum_pv = s.sum_pv - (old_close * old_vol) + (c * v);
                let new_sum_vol = s.sum_vol - old_vol + v;
                out.moving_averages.insert(format!("VWMA{}", len), if new_sum_vol != 0.0 { new_sum_pv / new_sum_vol } else { 0.0 });
            }
        }
        
        // HMA Update
        for (len, s) in &self.hma_states {
            if s.initialized && self.price_history_closes.len() >= *len {
                let _half = *len / 2;
                let _sqrt_len = (*len as f64).sqrt() as usize;
                
                // Simplified HMA calculation (proper implementation requires more state)
                // HMA = WMA(2 * WMA(n/2) - WMA(n), sqrt(n))
                out.moving_averages.insert(format!("HMA{}", len), s.wma_half * 2.0 - s.wma_full);
            }
        }
        
        for (len, s) in &self.rsi_states { if s.initialized {
            let chg = c - s.prev_close; let g = if chg > 0.0 { chg } else { 0.0 }; let l_ = if chg < 0.0 { -chg } else { 0.0 };
            let ag = (s.avg_gain * (*len as f64 - 1.0) + g) / *len as f64; let al = (s.avg_loss * (*len as f64 - 1.0) + l_) / *len as f64;
            let rs = if al == 0.0 { 100.0 } else { ag / al }; out.oscillators.insert(format!("RSI{}", len), 100.0 - (100.0 / (1.0 + rs)));
        }}
        for (k, s) in &self.macd_states { if s.initialized {
            let f = (c - s.ema_fast) * s.k_fast + s.ema_fast; let sl = (c - s.ema_slow) * s.k_slow + s.ema_slow;
            let m = f - sl; let sig = (m - s.signal_val) * s.k_signal + s.signal_val;
            out.oscillators.insert(format!("{}.macd", k), m); out.oscillators.insert(format!("{}.signal", k), sig); out.oscillators.insert(format!("{}.histogram", k), m - sig);
        }}
        for (len, s) in &self.bb_states { if s.initialized && self.price_history_closes.len() >= *len {
            let old = self.price_history_closes[self.price_history_closes.len() - *len]; 
            let ns = s.sum - old + c; let nsq = s.sum_sq - (old*old) + (c*c);
            let sma = ns / *len as f64; let sd = if (nsq - (ns*ns) / *len as f64) / *len as f64 > 0.0 { ((nsq - (ns*ns) / *len as f64) / *len as f64).sqrt() } else { 0.0 };
            out.volatility.insert(format!("BB{}_upper", len), sma + s.std_dev_mult * sd); out.volatility.insert(format!("BB{}_lower", len), sma - s.std_dev_mult * sd); out.volatility.insert(format!("BB{}_basis", len), sma);
        }}
        for (len, s) in &self.atr_states { if s.initialized {
            let tr = (h - l).max((h - s.prev_close).abs()).max((l - s.prev_close).abs());
            out.volatility.insert(format!("ATR{}", len), (s.value * (*len as f64 - 1.0) + tr) / *len as f64);
        }}
        for (key, s) in &self.stoch_states { if s.initialized && self.price_history_highs.len() >= s.k_len {
            let start = self.price_history_highs.len() - s.k_len;
            let mut max_h = h; let mut min_l = l;
            for i in start..self.price_history_highs.len() {
                max_h = max_h.max(self.price_history_highs[i]);
                min_l = min_l.min(self.price_history_lows[i]);
            }
            let k = if max_h == min_l { 50.0 } else { (c - min_l) / (max_h - min_l) * 100.0 };
            
            // Calculate D (SMA of K)
            let mut k_sum: f64 = s.k_buffer.iter().sum();
            if !s.k_buffer.is_empty() && s.k_buffer.len() >= s.d_len { 
                k_sum = k_sum - *s.k_buffer.front().unwrap() + k; 
                out.oscillators.insert(format!("STOCH_{}.d", key), k_sum / s.d_len as f64);
            } else {
                 k_sum += k;
                 out.oscillators.insert(format!("STOCH_{}.d", key), k_sum / (s.k_buffer.len() + 1) as f64);
            }
            out.oscillators.insert(format!("STOCH_{}.k", key), k); 
        }}

        // CCI Update
        for (len, s) in &self.cci_states { if s.initialized && s.tp_buffer.len() >= *len {
             let tp = (h + l + c) / 3.0;
             let sum = s.sum_tp - s.tp_buffer.front().unwrap() + tp;
             let sma = sum / *len as f64;
             
             let mut mean_dev = 0.0;
             // Iterate buffer skipping first, adding current
             for i in 1..s.tp_buffer.len() { mean_dev += (s.tp_buffer[i] - sma).abs(); }
             mean_dev += (tp - sma).abs();
             mean_dev /= *len as f64;
             
             let cci = if mean_dev == 0.0 { 0.0 } else { (tp - sma) / (0.015 * mean_dev) };
             out.oscillators.insert(format!("CCI{}", len), cci);
        }}

        // Advanced Updates
        for (len, s) in &self.mom_states { if s.initialized && self.price_history_closes.len() >= *len + 1 { 
            let old = self.price_history_closes[self.price_history_closes.len() - *len - 1]; 
            out.oscillators.insert(format!("MOM{}", len), c - old); 
        }}
        for (len, s) in &self.volma_states { if s.initialized && self.price_history_volumes.len() >= *len { 
            let old = self.price_history_volumes[self.price_history_volumes.len() - *len]; 
            out.moving_averages.insert(format!("VolMa{}", len), (s.sum - old + v) / *len as f64); 
        }}
        for (len, s) in &self.wr_states { if s.initialized && self.price_history_highs.len() >= *len {
             let start = self.price_history_highs.len() - *len;
             let mut max_h = h; let mut min_l = l;
             for i in start..self.price_history_highs.len() {
                 max_h = max_h.max(self.price_history_highs[i]);
                 min_l = min_l.min(self.price_history_lows[i]);
             }
             out.oscillators.insert(format!("WR{}", len), if max_h == min_l { -50.0 } else { (max_h - c) / (max_h - min_l) * -100.0 });
        }}
        
        // ADX Update
        for (len, s) in &self.adx_states { if s.initialized {
             let h_curr = h; let l_curr = l; let c_prev = s.prev_close;
             let tr = (h_curr - l_curr).max((h_curr - c_prev).abs()).max((l_curr - c_prev).abs());
             let up = h_curr - s.prev_high; let down = s.prev_low - l_curr;
             let pdm = if up > down && up > 0.0 { up } else { 0.0 };
             let ndm = if down > up && down > 0.0 { down } else { 0.0 };
             
             // Calculate temporary smoothed values (don't update state)
             let tr_smooth = (s.tr_smooth * (*len as f64 - 1.0) + tr) / *len as f64;
             let pdm_smooth = (s.pdm_smooth * (*len as f64 - 1.0) + pdm) / *len as f64;
             let ndm_smooth = (s.ndm_smooth * (*len as f64 - 1.0) + ndm) / *len as f64;
             
             let pdi = if tr_smooth == 0.0 { 0.0 } else { 100.0 * pdm_smooth / tr_smooth };
             let ndi = if tr_smooth == 0.0 { 0.0 } else { 100.0 * ndm_smooth / tr_smooth };
             let di_sum = pdi + ndi;
             let dx = if di_sum == 0.0 { 0.0 } else { 100.0 * (pdi - ndi).abs() / di_sum };
             
             // ADX Output (smoothed DX)
             let adx = (s.dx_smooth * (*len as f64 - 1.0) + dx) / *len as f64;
             out.oscillators.insert(format!("ADX{}", len), adx);
             // Return individual DIs if needed? Usually ADX indicator returns ADX, +DI, -DI.
             out.oscillators.insert(format!("ADX{}_plus", len), pdi);
             out.oscillators.insert(format!("ADX{}_minus", len), ndi);
        }}

        // SuperTrend Update
        // SuperTrend Update
        for (key, s) in &self.st_states { if s.initialized {
             let parts: Vec<&str> = key.split('-').collect();
             let len: usize = parts[0].parse().unwrap_or(10);
             let mult = s.multiplier;
             
             let tr = (h - l).max((h - s.prev_close).abs()).max((l - s.prev_close).abs());
             // RMA Smoothed ATR
             let atr = (s.atr * (len as f64 - 1.0) + tr) / len as f64;
             
             let basic_upper = (h + l) / 2.0 + mult * atr;
             let basic_lower = (h + l) / 2.0 - mult * atr;
             
             let final_upper;
             let final_lower;
             
             final_upper = if basic_upper < s.upper || s.prev_close > s.upper { s.upper } else { basic_upper };
             final_lower = if basic_lower > s.lower || s.prev_close < s.lower { s.lower } else { basic_lower };
             
             let mut trend = s.trend;
             if trend == 1 {
                 if c < final_lower { trend = -1; }
             } else {
                 if c > final_upper { trend = 1; }
             }
             
             out.volatility.insert(format!("SuperTrend_{}", key), trend as f64);
             out.volatility.insert(format!("SuperTrend_{}_upper", key), final_upper);
             out.volatility.insert(format!("SuperTrend_{}_lower", key), final_lower);
        }}
        
        // Chop Update
        for (len, s) in &self.chop_states { if s.initialized && s.tr_buffer.len() >= *len {
            let tr = (h - l).max((h - s.prev_close).abs()).max((l - s.prev_close).abs());
            let sum_tr = s.sum_tr - s.tr_buffer.front().unwrap() + tr;
            
            // Find Max High and Min Low (including current)
            let mut max_h = h; let mut min_l = l;
            for &val in &s.highs { max_h = max_h.max(val); }
            for &val in &s.lows { min_l = min_l.min(val); }
            
            let range = max_h - min_l;
            let chop = if range == 0.0 { 0.0 } else {
                100.0 * (sum_tr / range).log10() / (*len as f64).log10()
            };
            out.volatility.insert(format!("CHOP{}", len), chop);
        }}
        
        // MFI Update
        for (len, s) in &self.mfi_states { if s.initialized && s.pos_flow.len() >= *len {
            let tp = (h + l + c) / 3.0;
            let rmf = tp * v;
            let (p, n) = if tp > s.prev_tp { (rmf, 0.0) } else if tp < s.prev_tp { (0.0, rmf) } else { (0.0, 0.0) };
            
            let sum_p = s.sum_p - s.pos_flow.front().unwrap_or(&0.0) + p;
            let sum_n = s.sum_n - s.neg_flow.front().unwrap_or(&0.0) + n;
            
            let mfi = if sum_n == 0.0 { 100.0 } else { 100.0 - (100.0 / (1.0 + sum_p / sum_n)) };
            out.oscillators.insert(format!("MFI{}", len), mfi);
        }}
        
        // VWAP Update
        for (key, s) in &self.vwap_states {
            let tp = (h + l + c) / 3.0;
            let cum_pv = s.cum_pv + tp * v;
            let cum_vol = s.cum_vol + v;
            let vwap = if cum_vol == 0.0 { 0.0 } else { cum_pv / cum_vol };
            out.volatility.insert(format!("VWAP_{}", key), vwap);
        }

        serde_json::to_string(&out).unwrap_or(String::from("{}"))
    }

    pub fn shift(&mut self, _o: f64, h: f64, l: f64, c: f64, v: f64, _t: f64) {
        // Update global price history buffers
        if self.price_history_closes.len() >= self.max_history_size {
            self.price_history_closes.pop_front();
            self.price_history_highs.pop_front();
            self.price_history_lows.pop_front();
            self.price_history_volumes.pop_front();
        }
        self.price_history_closes.push_back(c);
        self.price_history_highs.push_back(h);
        self.price_history_lows.push_back(l);
        self.price_history_volumes.push_back(v);

        // ... Core Shifts ...
        for (_len, s) in &mut self.ema_states { if s.initialized { s.value = (c - s.value) * s.k + s.value; }}
        
        // SMA Shift
        for (len, s) in &mut self.sma_states {
            if s.initialized && self.price_history_closes.len() >= *len {
                let old = self.price_history_closes[self.price_history_closes.len() - *len];
                s.sum = s.sum - old + c;
            }
        }
        
        // WMA Shift (recalculate from price history)
        for (len, s) in &mut self.wma_states {
            if s.initialized && self.price_history_closes.len() >= *len {
                let weights_sum = (*len * (*len + 1)) / 2;
                let mut wma = 0.0;
                for i in 0..*len {
                    let idx = self.price_history_closes.len() - *len + i;
                    wma += self.price_history_closes[idx] * (i + 1) as f64;
                }
                wma += c * (*len + 1) as f64;
                s.sum = wma / weights_sum as f64;
            }
        }
        
        // VWMA Shift
        for (len, s) in &mut self.vwma_states {
            if s.initialized && self.price_history_closes.len() >= *len && self.price_history_volumes.len() >= *len {
                let old_close = self.price_history_closes[self.price_history_closes.len() - *len];
                let old_vol = self.price_history_volumes[self.price_history_volumes.len() - *len];
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
                let mut wma_half = 0.0;
                for i in 0..half {
                    let idx = self.price_history_closes.len() - half + i;
                    wma_half += self.price_history_closes[idx] * (i + 1) as f64;
                }
                wma_half += c * (half + 1) as f64;
                s.wma_half = wma_half / weights_half as f64;
                
                // Recalculate WMA(n)
                let weights_full = (*len * (*len + 1)) / 2;
                let mut wma_full = 0.0;
                for i in 0..*len {
                    let idx = self.price_history_closes.len() - *len + i;
                    wma_full += self.price_history_closes[idx] * (i + 1) as f64;
                }
                wma_full += c * (*len + 1) as f64;
                s.wma_full = wma_full / weights_full as f64;
            }
        }
        
        for (len, s) in &mut self.rsi_states { if s.initialized {
            let chg = c - s.prev_close; let g = if chg > 0.0 { chg } else { 0.0 }; let l_ = if chg < 0.0 { -chg } else { 0.0 };
            s.avg_gain = (s.avg_gain * (*len as f64 - 1.0) + g) / *len as f64; s.avg_loss = (s.avg_loss * (*len as f64 - 1.0) + l_) / *len as f64; s.prev_close = c;
        }}
        for (_k, s) in &mut self.macd_states { if s.initialized {
            s.ema_fast = (c - s.ema_fast) * s.k_fast + s.ema_fast; s.ema_slow = (c - s.ema_slow) * s.k_slow + s.ema_slow; s.signal_val = ((s.ema_fast - s.ema_slow) - s.signal_val) * s.k_signal + s.signal_val;
        }}
        for (len, s) in &mut self.bb_states { if s.initialized && self.price_history_closes.len() >= *len { 
            let old = self.price_history_closes[self.price_history_closes.len() - *len]; 
            s.sum = s.sum - old + c; s.sum_sq = s.sum_sq - (old*old) + (c*c); 
        }}
        for (len, s) in &mut self.atr_states { if s.initialized {
             let tr = (h - l).max((h - s.prev_close).abs()).max((l - s.prev_close).abs()); s.value = (s.value * (*len as f64 - 1.0) + tr) / *len as f64; s.prev_close = c;
        }}
        for (_key, s) in &mut self.stoch_states { if s.initialized {
            // Find max_h/min_l over last K periods from global history
            // Global history now includes current h/l at the end
            let hist_len = self.price_history_highs.len();
            let start = if hist_len > s.k_len { hist_len - s.k_len } else { 0 };
            
            let mut max_h = f64::MIN; let mut min_l = f64::MAX;
            for i in start..hist_len {
                max_h = max_h.max(self.price_history_highs[i]);
                min_l = min_l.min(self.price_history_lows[i]);
            }
            let k = if max_h == min_l { 50.0 } else { (c - min_l) / (max_h - min_l) * 100.0 };
            
            s.k_buffer.push_back(k); if s.k_buffer.len() > s.d_len { s.k_buffer.pop_front(); }
            s.d_val = s.k_buffer.iter().sum::<f64>() / s.k_buffer.len().max(1) as f64;
        }}
        
        // CCI Shift
        for (len, s) in &mut self.cci_states { if s.initialized {
            let tp = (h + l + c) / 3.0;
            s.tp_buffer.push_back(tp);
            s.sum_tp += tp;
            if s.tp_buffer.len() > *len { s.sum_tp -= s.tp_buffer.pop_front().unwrap(); }
        }}

        // Advanced Shifts
        for (_len, s) in &mut self.mom_states { if s.initialized { 
            // Momentum no longer needs internal buffer, using global closes
        }}
        for (len, s) in &mut self.volma_states { if s.initialized && self.price_history_volumes.len() >= *len { 
            let old = self.price_history_volumes[self.price_history_volumes.len() - *len];
            s.sum = s.sum - old + v; 
        }}
        for (_len, s) in &mut self.wr_states { if s.initialized {
            // WR no longer needs internal buffer, using global highs/lows
        }}
        
        // ADX Shift
        for (len, s) in &mut self.adx_states { if s.initialized {
             let h_curr = h; let l_curr = l; let c_prev = s.prev_close;
             let tr = (h_curr - l_curr).max((h_curr - c_prev).abs()).max((l_curr - c_prev).abs());
             let up = h_curr - s.prev_high; let down = s.prev_low - l_curr;
             let pdm = if up > down && up > 0.0 { up } else { 0.0 };
             let ndm = if down > up && down > 0.0 { down } else { 0.0 };
             
             // Update state with permanent values
             s.tr_smooth = (s.tr_smooth * (*len as f64 - 1.0) + tr) / *len as f64;
             s.pdm_smooth = (s.pdm_smooth * (*len as f64 - 1.0) + pdm) / *len as f64;
             s.ndm_smooth = (s.ndm_smooth * (*len as f64 - 1.0) + ndm) / *len as f64;
             
             let pdi = if s.tr_smooth == 0.0 { 0.0 } else { 100.0 * s.pdm_smooth / s.tr_smooth };
             let ndi = if s.tr_smooth == 0.0 { 0.0 } else { 100.0 * s.ndm_smooth / s.tr_smooth };
             let di_sum = pdi + ndi;
             let dx = if di_sum == 0.0 { 0.0 } else { 100.0 * (pdi - ndi).abs() / di_sum };
             
             // Update ADX state
             s.dx_smooth = (s.dx_smooth * (*len as f64 - 1.0) + dx) / *len as f64;
             
             s.prev_high = h;
             s.prev_low = l;
             s.prev_close = c;
        }}
        
        // SuperTrend Shift
        for (key, s) in &mut self.st_states { if s.initialized {
             let parts: Vec<&str> = key.split('-').collect();
             let len: usize = parts[0].parse().unwrap_or(10);
             let mult = s.multiplier;
             
             let tr = (h - l).max((h - s.prev_close).abs()).max((l - s.prev_close).abs());
             // Update ATR state (RMA)
             s.atr = (s.atr * (len as f64 - 1.0) + tr) / len as f64;
             
             let basic_upper = (h + l) / 2.0 + mult * s.atr;
             let basic_lower = (h + l) / 2.0 - mult * s.atr;
             
             let final_upper;
             let final_lower;
             
             final_upper = if basic_upper < s.upper || s.prev_close > s.upper { s.upper } else { basic_upper };
             final_lower = if basic_lower > s.lower || s.prev_close < s.lower { s.lower } else { basic_lower };
             
             let mut trend = s.trend;
             if trend == 1 {
                 if c < final_lower { trend = -1; }
             } else {
                 if c > final_upper { trend = 1; }
             }
             
             s.upper = final_upper;
             s.lower = final_lower;
             s.trend = trend;
             s.prev_close = c;
        }}
        
        // Chop Shift
        for (len, s) in &mut self.chop_states { if s.initialized {
            let tr = (h - l).max((h - s.prev_close).abs()).max((l - s.prev_close).abs());
            
            s.tr_buffer.push_back(tr);
            s.sum_tr += tr;
            if s.tr_buffer.len() > *len { s.sum_tr -= s.tr_buffer.pop_front().unwrap(); }
            
            s.highs.push_back(h);
            if s.highs.len() > *len { s.highs.pop_front(); }
            
            s.lows.push_back(l);
            if s.lows.len() > *len { s.lows.pop_front(); }
            
            s.prev_close = c;
        }}
        
        // MFI Shift
        for (len, s) in &mut self.mfi_states { if s.initialized {
            let tp = (h + l + c) / 3.0;
            let rmf = tp * v;
            let (p, n) = if tp > s.prev_tp { (rmf, 0.0) } else if tp < s.prev_tp { (0.0, rmf) } else { (0.0, 0.0) };
            
            s.pos_flow.push_back(p);
            s.sum_p += p;
            if s.pos_flow.len() > *len { s.sum_p -= s.pos_flow.pop_front().unwrap(); }
            
            s.neg_flow.push_back(n);
            s.sum_n += n;
            if s.neg_flow.len() > *len { s.sum_n -= s.neg_flow.pop_front().unwrap(); }
            
            s.prev_tp = tp;
        }}
        
        // VWAP Shift
        for (_key, s) in &mut self.vwap_states {
            let tp = (h + l + c) / 3.0;
            s.cum_pv += tp * v;
            s.cum_vol += v;
            // s.last_t = t; // t is not passed as f64 in shift sig in all versions? 
            // Check shift sig: shift(&mut self, _o: f64, h: f64, l: f64, c: f64, v: f64, _t: f64)
            s.last_t = _t;
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
        let closes = vec![100.0; 20];
        let highs = vec![105.0; 20];
        let lows = vec![95.0; 20];
        let volumes = vec![1000.0; 20];
        let times = vec![0.0; 20];

        // Settings with specific multiplier 4.5
        let settings_json = r#"{
            "supertrend": [{ "length": 14, "multiplier": 4.5 }]
        }"#;

        calc.initialize(&closes, &highs, &lows, &volumes, &times, settings_json);

        // Verify that the state was initialized with the correct multiplier
        // Key is "14-4.5"
        let state = calc.st_states.get("14-4.5").expect("SuperTrend state should exist");

        assert_eq!(state.multiplier, 4.5, "Multiplier should be 4.5 as set in settings");
    }
}
