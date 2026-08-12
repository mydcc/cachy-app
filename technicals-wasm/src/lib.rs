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
use rust_decimal::Decimal;
use rust_decimal::prelude::ToPrimitive;
use rust_decimal::prelude::FromPrimitive;
use rust_decimal::MathematicalOps;
use std::str::FromStr;

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
#[derive(Serialize, Deserialize, Clone, Default)] pub struct BbSettings { pub length: usize, pub std_dev: Decimal }
#[derive(Serialize, Deserialize, Clone, Default)] pub struct AtrSettings { pub length: usize }
#[derive(Serialize, Deserialize, Clone, Default)] pub struct StochSettings { pub k: usize, pub d: usize, pub smooth: usize }
#[derive(Serialize, Deserialize, Clone, Default)] pub struct CciSettings { pub length: usize }
#[derive(Serialize, Deserialize, Clone, Default)] pub struct AdxSettings { pub length: usize }
#[derive(Serialize, Deserialize, Clone, Default)] pub struct SuperTrendSettings { pub length: usize, pub multiplier: Decimal }
#[derive(Serialize, Deserialize, Clone, Default)] pub struct MomSettings { pub length: usize }
#[derive(Serialize, Deserialize, Clone, Default)] pub struct WrSettings { pub length: usize }
#[derive(Serialize, Deserialize, Clone, Default)] pub struct VolMaSettings { pub length: usize }
#[derive(Serialize, Deserialize, Clone, Default)] pub struct PivotSettings { pub type_: String }
#[derive(Serialize, Deserialize, Clone, Default)] pub struct PsarSettings { pub start: Decimal, pub increment: Decimal, pub max: Decimal }
#[derive(Serialize, Deserialize, Clone, Default)] pub struct ChopSettings { pub length: usize }
#[derive(Serialize, Deserialize, Clone, Default)] pub struct VwapSettings { pub anchor: String }
#[derive(Serialize, Deserialize, Clone, Default)] pub struct MfiSettings { pub length: usize }

struct EmaState { k: Decimal, value: Decimal, initialized: bool }
struct SmaState { sum: Decimal, initialized: bool }
struct WmaState { weighted_sum: Decimal, price_sum: Decimal, initialized: bool }
struct VwmaState { sum_pv: Decimal, sum_vol: Decimal, initialized: bool }
struct HmaState { wma_half: Decimal, wma_full: Decimal, _sqrt_wma: Decimal, initialized: bool }
struct RsiState { avg_gain: Decimal, avg_loss: Decimal, prev_close: Decimal, initialized: bool }
struct MacdState { ema_fast: Decimal, ema_slow: Decimal, signal_val: Decimal, k_fast: Decimal, k_slow: Decimal, k_signal: Decimal, initialized: bool }
struct BbState { sum: Decimal, sum_sq: Decimal, std_dev_mult: Decimal, initialized: bool }
struct AtrState { value: Decimal, prev_close: Decimal, initialized: bool }
struct StochState { k_buffer: VecDeque<Decimal>, d_val: Decimal, k_len: usize, d_len: usize, initialized: bool }
struct MomState { initialized: bool }
struct WrState { initialized: bool }
struct VolMaState { sum: Decimal, initialized: bool }

#[allow(dead_code)]
struct CciState { tp_buffer: VecDeque<Decimal>, sum_tp: Decimal, initialized: bool }
#[allow(dead_code)]
struct AdxState { tr_smooth: Decimal, pdm_smooth: Decimal, ndm_smooth: Decimal, dx_smooth: Decimal, prev_high: Decimal, prev_low: Decimal, prev_close: Decimal, initialized: bool }
#[allow(dead_code)]
struct SuperTrendState { atr: Decimal, upper: Decimal, lower: Decimal, trend: i32, prev_close: Decimal, initialized: bool, multiplier: Decimal }
#[allow(dead_code)]
struct ChopState { highs: VecDeque<Decimal>, lows: VecDeque<Decimal>, tr_buffer: VecDeque<Decimal>, sum_tr: Decimal, prev_close: Decimal, initialized: bool }
#[allow(dead_code)]
struct MfiState { pos_flow: VecDeque<Decimal>, neg_flow: VecDeque<Decimal>, sum_p: Decimal, sum_n: Decimal, prev_tp: Decimal, initialized: bool }
#[allow(dead_code)]
struct VwapState { cum_vol: Decimal, cum_pv: Decimal, last_t: Decimal }
#[allow(dead_code)]
#[derive(Default, Clone, Copy)] pub struct PivotState { pub p: Decimal, pub r1: Decimal, pub r2: Decimal, pub r3: Decimal, pub s1: Decimal, pub s2: Decimal, pub s3: Decimal, pub basis_h: Decimal, pub basis_l: Decimal, pub basis_c: Decimal, pub basis_o: Decimal, initialized: bool }
#[allow(dead_code)]
#[derive(Default, Clone, Copy)] pub struct PsarState { pub sar: Decimal, pub ep: Decimal, pub af: Decimal, pub is_long: bool, pub max_af: Decimal, pub inc_af: Decimal, pub prev_high: Decimal, pub prev_low: Decimal, initialized: bool }

#[derive(Serialize)]
struct OutputData {
    #[serde(rename = "movingAverages")] moving_averages: HashMap<String, Decimal>,
    oscillators: HashMap<String, Decimal>,
    volatility: HashMap<String, Decimal>,
    pivots: HashMap<String, Decimal>,
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
            price_history_closes: VecDeque::<Decimal>::with_capacity(200),
            price_history_highs: VecDeque::<Decimal>::with_capacity(200),
            price_history_lows: VecDeque::<Decimal>::with_capacity(200),
            price_history_volumes: VecDeque::<Decimal>::with_capacity(200),
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

    pub fn initialize(&mut self, closes_str: Vec<String>, highs_str: Vec<String>, lows_str: Vec<String>, volumes_str: Vec<String>, _times: Vec<f64>, settings_json: &str) {
        let closes: Vec<Decimal> = closes_str.iter().map(|s| Decimal::from_str(s).expect("Invalid decimal string")).collect();
        let highs: Vec<Decimal> = highs_str.iter().map(|s| Decimal::from_str(s).expect("Invalid decimal string")).collect();
        let lows: Vec<Decimal> = lows_str.iter().map(|s| Decimal::from_str(s).expect("Invalid decimal string")).collect();
        let volumes: Vec<Decimal> = volumes_str.iter().map(|s| Decimal::from_str(s).expect("Invalid decimal string")).collect();
        self.settings = serde_json::from_str(settings_json).unwrap_or_else(|e| { println!("JSON Parse Error: {:?}", e); IndicatorSettings::default() });
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
            let k = Decimal::TWO / (Decimal::from(s.length) + Decimal::ONE);
            let mut val = closes[0]; let mut init = false;
            if len >= s.length { val = closes[0..s.length].iter().sum::<Decimal>() / Decimal::from(s.length); for &p in &closes[s.length..] { val = (p - val) * k + val; } init = true; }
            self.ema_states.insert(s.length, EmaState { k, value: val, initialized: init });
        }
        
        // SMA Init
        for s in &self.settings.sma {
            let mut sum = Decimal::ZERO; let mut init = false;
            if len >= s.length {
                for &p in &closes[(len - s.length)..] { sum += p; }
                init = true;
            }
            self.sma_states.insert(s.length, SmaState { sum, initialized: init });
        }
        
        // WMA Init (Weighted Moving Average)
        for s in &self.settings.wma {
            let mut weighted_sum = Decimal::ZERO; let mut price_sum = Decimal::ZERO; let mut init = false;
            if len >= s.length {
                for i in 0..s.length {
                    let p = closes[len - s.length + i];
                    weighted_sum += p * Decimal::from(i + 1);
                    price_sum += p;
                }
                init = true;
            }
            self.wma_states.insert(s.length, WmaState { weighted_sum, price_sum, initialized: init });
        }
        
        // VWMA Init (Volume-Weighted Moving Average)
        for s in &self.settings.vwma {
            let mut sum_pv = Decimal::ZERO; let mut sum_vol = Decimal::ZERO; let mut init = false;
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
            let sqrt_len = Decimal::from(s.length).sqrt().unwrap().to_usize().unwrap();
            let mut wma_half = Decimal::ZERO; let mut wma_full = Decimal::ZERO; let mut _sqrt_wma = Decimal::ZERO; let mut init = false;
            
            if len >= s.length + sqrt_len {
                // Calculate WMA(n/2)
                let weights_half = (half_len * (half_len + 1)) / 2;
                for i in 0..half_len {
                    wma_half += closes[len - half_len + i] * Decimal::from(i + 1);
                }
                wma_half /= Decimal::from(weights_half);
                
                // Calculate WMA(n)
                let weights_full = (s.length * (s.length + 1)) / 2;
                for i in 0..s.length {
                    wma_full += closes[len - s.length + i] * Decimal::from(i + 1);
                }
                wma_full /= Decimal::from(weights_full);
                
                init = true;
            }
            self.hma_states.insert(s.length, HmaState { wma_half, wma_full, _sqrt_wma, initialized: init });
        }
        
        for s in &self.settings.rsi {
            let mut avg_gain = Decimal::ZERO; let mut avg_loss = Decimal::ZERO; let mut prev = closes[0]; let mut init = false;
            if len > s.length {
                for i in 1..=s.length { let chg = closes[i] - closes[i-1]; if chg > Decimal::ZERO { avg_gain += chg; } else { avg_loss -= chg; } }
                avg_gain /= Decimal::from(s.length); avg_loss /= Decimal::from(s.length);
                for i in (s.length+1)..len { let chg = closes[i] - closes[i-1]; let g = if chg > Decimal::ZERO { chg } else { Decimal::ZERO }; let l = if chg < Decimal::ZERO { -chg } else { Decimal::ZERO }; avg_gain = (avg_gain * (Decimal::from(s.length) - Decimal::ONE) + g) / Decimal::from(s.length); avg_loss = (avg_loss * (Decimal::from(s.length) - Decimal::ONE) + l) / Decimal::from(s.length); }
                prev = closes[len-1]; init = true;
            }
            self.rsi_states.insert(s.length, RsiState { avg_gain, avg_loss, prev_close: prev, initialized: init });
        }
        for s in &self.settings.macd {
             let k_f = Decimal::TWO / (Decimal::from(s.fast) + Decimal::ONE); let k_s = Decimal::TWO / (Decimal::from(s.slow) + Decimal::ONE); let k_sig = Decimal::TWO / (Decimal::from(s.signal) + Decimal::ONE);
             let mut init = false; let mut ef = Decimal::ZERO; let mut es = Decimal::ZERO; let mut sv = Decimal::ZERO;
             if len > s.slow + s.signal {
                 ef = closes[0]; es = closes[0]; for &p in closes.iter() { ef = (p - ef) * k_f + ef; es = (p - es) * k_s + es; sv = ((ef - es) - sv) * k_sig + sv; } init = true;
             }
             self.macd_states.insert(format!("{}-{}-{}", s.fast, s.slow, s.signal), MacdState { ema_fast: ef, ema_slow: es, signal_val: sv, k_fast: k_f, k_slow: k_s, k_signal: k_sig, initialized: init });
        }
        for s in &self.settings.bb {
             let mut sum = Decimal::ZERO; let mut sum_sq = Decimal::ZERO; let mut init = false;
             if len >= s.length { 
                 for &p in &closes[(len - s.length)..] { sum += p; sum_sq += p * p; }
                 init = true; 
             }
             self.bb_states.insert(s.length, BbState { sum, sum_sq, std_dev_mult: s.std_dev, initialized: init });
        }
        for s in &self.settings.atr {
             let mut val = Decimal::ZERO; let mut init = false;
             if len > s.length {
                 let mut tr_sum = Decimal::ZERO; for i in 1..=s.length { let h = highs[i]; let l = lows[i]; let pc = closes[i-1]; tr_sum += (h - l).max((h - pc).abs()).max((l - pc).abs()); }
                 val = Decimal::from(tr_sum / Decimal::from(s.length));
                 for i in (s.length+1)..len { let h = highs[i]; let l = lows[i]; let pc = closes[i-1]; val = (val * (Decimal::from(s.length) - Decimal::ONE) + (h - l).max((h - pc).abs()).max((l - pc).abs())) / Decimal::from(s.length); }
                 init = true;
             }
             self.atr_states.insert(s.length, AtrState { value: val, prev_close: closes[len-1], initialized: init });
        }
        for s in &self.settings.stoch {
             let mut k_buf = VecDeque::new(); let mut init = false; let mut d_val = Decimal::ZERO;
             if len >= s.k + s.smooth {
                 for i in 0..len {
                     if i >= s.k - 1 {
                         // Find MaxH and MinL over last K periods
                         let start = i + 1 - s.k;
                         // Optimization: Slice is faster than iter loop if possible, but VecDeque doesn't slice easily.
                         // Using manual loop for now or global buffers? Init uses slice 'highs'.
                         let mut max_h = Decimal::MIN; let mut min_l = Decimal::MAX;
                         for j in start..=i { max_h = max_h.max(highs[j]); min_l = min_l.min(lows[j]); }
                         
                         let k = if max_h == min_l { Decimal::from_str("50.0").unwrap() } else { (closes[i] - min_l) / (max_h - min_l) * Decimal::ONE_HUNDRED };
                         k_buf.push_back(k); if k_buf.len() > s.d { k_buf.pop_front(); }
                         if k_buf.len() == s.d { d_val = k_buf.iter().sum::<Decimal>() / Decimal::from(s.d); }
                     }
                 }
                 init = true;
             }
             self.stoch_states.insert(format!("{}-{}-{}", s.k, s.d, s.smooth), StochState { k_buffer: k_buf, d_val, k_len: s.k, d_len: s.d, initialized: init });
        }

        // CCI Init
        for s in &self.settings.cci {
            let mut tp_buf = VecDeque::new(); let mut init = false; let mut sum_tp = Decimal::ZERO;
            if len >= s.length {
                for i in 0..len {
                    let tp = (highs[i] + lows[i] + closes[i]) / Decimal::from(3);
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
            let mut sum = Decimal::ZERO; let mut init = false;
            if len >= s.length { for &v in &volumes[len - s.length ..] { sum += v; } init = true; }
            self.volma_states.insert(s.length, VolMaState { sum, initialized: init });
        }
        for s in &self.settings.wr {
            let init = len >= s.length;
            self.wr_states.insert(s.length, WrState { initialized: init });
        }
        
        // ADX Init
        for s in &self.settings.adx {
            // Simplified ADX Init: Needs at least 2length? Standard ADX needs some history to stabilize.
            // Using standard Wilder's smoothing initialization.
            let mut tr_smooth = Decimal::ZERO; let mut pdm_smooth = Decimal::ZERO; let mut ndm_smooth = Decimal::ZERO;
            let mut dx_smooth = Decimal::ZERO; let mut init = false;
            let mut prev_h = highs[0]; let mut prev_l = lows[0]; let mut prev_c = closes[0];
            
            if len > s.length * 2 { // ADX needs more history
                 // 1. Initial SMA for first Length periods
                 let mut tr_sum = Decimal::ZERO; let mut pdm_sum = Decimal::ZERO; let mut ndm_sum = Decimal::ZERO;
                 for i in 1..=s.length {
                     let h = highs[i]; let l = lows[i]; let pc = closes[i-1];
                     let tr = (h - l).max((h - pc).abs()).max((l - pc).abs());
                     let up = h - highs[i-1]; let down = lows[i-1] - l;
                     let pdm = if up > down && up > Decimal::ZERO { up } else { Decimal::ZERO };
                     let ndm = if down > up && down > Decimal::ZERO { down } else { Decimal::ZERO };
                     tr_sum += tr; pdm_sum += pdm; ndm_sum += ndm;
                 }
                 tr_smooth = tr_sum; pdm_smooth = pdm_sum; ndm_smooth = ndm_sum; // First value is sum (or average? Wilder says sum for first?)
                 // Actually Wilder's usually starts with SMA.
                 // Let's use Average.
                 tr_smooth /= Decimal::from(s.length); pdm_smooth /= Decimal::from(s.length); ndm_smooth /= Decimal::from(s.length);

                 // 2. Smoothing loop
                 let _dx_sum = Decimal::ZERO;
                 for i in (s.length+1)..len {
                     let h = highs[i]; let l = lows[i]; let pc = closes[i-1];
                     let tr = (h - l).max((h - pc).abs()).max((l - pc).abs());
                     let up = h - highs[i-1]; let down = lows[i-1] - l;
                     let pdm = if up > down && up > Decimal::ZERO { up } else { Decimal::ZERO };
                     let ndm = if down > up && down > Decimal::ZERO { down } else { Decimal::ZERO };
                     
                     tr_smooth = (tr_smooth * (Decimal::from(s.length) - Decimal::ONE) + tr) / Decimal::from(s.length);
                     pdm_smooth = (pdm_smooth * (Decimal::from(s.length) - Decimal::ONE) + pdm) / Decimal::from(s.length);
                     ndm_smooth = (ndm_smooth * (Decimal::from(s.length) - Decimal::ONE) + ndm) / Decimal::from(s.length);
                     
                     let pdi = Decimal::ONE_HUNDRED * pdm_smooth / tr_smooth;
                     let ndi = Decimal::ONE_HUNDRED * ndm_smooth / tr_smooth;
                     let di_sum = pdi + ndi;
                     let dx = if di_sum == Decimal::ZERO { Decimal::ZERO } else { Decimal::ONE_HUNDRED * (pdi - ndi).abs() / di_sum };
                     
                     // ADX Smoothing: ADX is EMA/RMA of DX? Usually RMA.
                     // But we need to accumulate DX to get first ADX.
                     // Let's just track ADX via smoothing: adx = (adx * (n-1) + dx) / n
                     if i == s.length * 2 - 1 {
                         dx_smooth = dx;
                     } else if i >= s.length * 2 {
                         dx_smooth = (dx_smooth * (Decimal::from(s.length) - Decimal::ONE) + dx) / Decimal::from(s.length);
                     }
                 }
                 init = true;
                 prev_h = highs[len-1]; prev_l = lows[len-1]; prev_c = closes[len-1];
            }
            self.adx_states.insert(s.length, AdxState { tr_smooth, pdm_smooth, ndm_smooth, dx_smooth, prev_high: prev_h, prev_low: prev_l, prev_close: prev_c, initialized: init });
        }

        // SuperTrend Init
        for s in &self.settings.supertrend {
             let _tr_val = Decimal::ZERO; let mut atr = Decimal::ZERO;
             let mut upper = Decimal::ZERO; let mut lower = Decimal::ZERO;
             let mut final_upper; let mut final_lower;
             let mut trend = 1;
             let mut init = false;
             
             if len > s.length {
                 // 1. Calculate initial ATR over first 'length' candles
                 let mut tr_sum = Decimal::ZERO;
                 for i in 1..=s.length {
                     let h = highs[i]; let l = lows[i]; let pc = closes[i-1];
                     let tr = (h - l).max((h - pc).abs()).max((l - pc).abs());
                     tr_sum += tr;
                 }
                 atr = Decimal::from(tr_sum / Decimal::from(s.length));
                 
                 // Initial Bands
                 let h = highs[s.length]; let l = lows[s.length];
                 let basic_upper = (h + l) / Decimal::TWO + s.multiplier * atr;
                 let basic_lower = (h + l) / Decimal::TWO - s.multiplier * atr;
                 final_upper = basic_upper;
                 final_lower = basic_lower;
                 
                 // 2. Replay history to establish trend
                 for i in (s.length+1)..len {
                     let h = highs[i]; let l = lows[i]; let c = closes[i]; let pc = closes[i-1];
                     let tr = (h - l).max((h - pc).abs()).max((l - pc).abs());
                     
                     // RMA for ATR in SuperTrend? Or SMA? TradingView uses RMA.
                     atr = (atr * (Decimal::from(s.length) - Decimal::ONE) + tr) / Decimal::from(s.length);
                     
                     let basic_upper = (h + l) / Decimal::TWO + s.multiplier * atr;
                     let basic_lower = (h + l) / Decimal::TWO - s.multiplier * atr;
                     
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
            let mut sum_tr = Decimal::ZERO;
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

    pub fn update(&self, _o_str: String, h_str: String, l_str: String, c_str: String, v_str: String, _t: f64) -> String {
        let h = Decimal::from_str(&h_str).expect("Invalid decimal string");
        let l = Decimal::from_str(&l_str).expect("Invalid decimal string");
        let c = Decimal::from_str(&c_str).expect("Invalid decimal string");
        let v = Decimal::from_str(&v_str).expect("Invalid decimal string");
        let mut out = OutputData {
            moving_averages: HashMap::new(), oscillators: HashMap::new(), volatility: HashMap::new(), pivots: HashMap::new(),
        };

        // ... Core Updates ...
        for (len, s) in &self.ema_states { if s.initialized { out.moving_averages.insert(format!("EMA{}", len), (c - s.value) * s.k + s.value); }}
        
        // SMA Update
        for (len, s) in &self.sma_states { 
            if s.initialized && self.price_history_closes.len() >= *len {
                let old = self.price_history_closes[self.price_history_closes.len() - len];
                out.moving_averages.insert(format!("SMA{}", len), (s.sum - old + c) / Decimal::from(*len));
            }
        }
        
        // WMA Update
        for (len, s) in &self.wma_states {
            if s.initialized {
                let weights_sum = (len * (len + 1)) / 2;
                let wma = (s.weighted_sum - s.price_sum + (Decimal::from(*len) * c)) / Decimal::from(weights_sum);
                out.moving_averages.insert(format!("WMA{}", len), wma);
            }
        }
        
        // VWMA Update
        for (&len, s) in &self.vwma_states {
            if s.initialized && self.price_history_closes.len() >= len && self.price_history_volumes.len() >= len {
                let old_close = self.price_history_closes[self.price_history_closes.len() - len];
                let old_vol = self.price_history_volumes[self.price_history_volumes.len() - len];
                let new_sum_pv = s.sum_pv - (old_close * old_vol) + (c * v);
                let new_sum_vol = s.sum_vol - old_vol + v;
                out.moving_averages.insert(format!("VWMA{}", len), if new_sum_vol != Decimal::ZERO { new_sum_pv / new_sum_vol } else { Decimal::ZERO });
            }
        }
        
        // HMA Update
        for (&len, s) in &self.hma_states {
            if s.initialized && self.price_history_closes.len() >= len {
                let _half = len / 2;
                let _sqrt_len = Decimal::from(len).sqrt().unwrap().to_usize().unwrap();
                
                // Simplified HMA calculation (proper implementation requires more state)
                // HMA = WMA(2 * WMA(n/2) - WMA(n), sqrt(n))
                out.moving_averages.insert(format!("HMA{}", len), s.wma_half * Decimal::TWO - s.wma_full);
            }
        }
        
        for (&len, s) in &self.rsi_states { if s.initialized {
            let chg = c - s.prev_close; let g = if chg > Decimal::ZERO { chg } else { Decimal::ZERO }; let l_ = if chg < Decimal::ZERO { -chg } else { Decimal::ZERO };
            let ag = (s.avg_gain * (Decimal::from(len) - Decimal::ONE) + g) / Decimal::from(len); let al = (s.avg_loss * (Decimal::from(len) - Decimal::ONE) + l_) / Decimal::from(len);
            let rs = if al == Decimal::ZERO { Decimal::ONE_HUNDRED } else { ag / al }; out.oscillators.insert(format!("RSI{}", len), Decimal::ONE_HUNDRED - (Decimal::ONE_HUNDRED / (Decimal::ONE + rs)));
        }}
        for (k, s) in &self.macd_states { if s.initialized {
            let f = (c - s.ema_fast) * s.k_fast + s.ema_fast; let sl = (c - s.ema_slow) * s.k_slow + s.ema_slow;
            let m = f - sl; let sig = (m - s.signal_val) * s.k_signal + s.signal_val;
            out.oscillators.insert(format!("{}.macd", k), m); out.oscillators.insert(format!("{}.signal", k), sig); out.oscillators.insert(format!("{}.histogram", k), m - sig);
        }}
        for (&len, s) in &self.bb_states { if s.initialized && self.price_history_closes.len() >= len {
            let old = self.price_history_closes[self.price_history_closes.len() - len];
            let ns = s.sum - old + c; let nsq = s.sum_sq - (old*old) + (c*c);
            let sma = ns / Decimal::from(len); let sd = if (nsq - (ns*ns) / Decimal::from(len)) / Decimal::from(len) > Decimal::ZERO { ((nsq - (ns*ns) / Decimal::from(len)) / Decimal::from(len)).sqrt().unwrap() } else { Decimal::ZERO };
            out.volatility.insert(format!("BB{}_upper", len), sma + s.std_dev_mult * sd); out.volatility.insert(format!("BB{}_lower", len), sma - s.std_dev_mult * sd); out.volatility.insert(format!("BB{}_basis", len), sma);
        }}
        for (&len, s) in &self.atr_states { if s.initialized {
            let tr = (h - l).max((h - s.prev_close).abs()).max((l - s.prev_close).abs());
            out.volatility.insert(format!("ATR{}", len), (s.value * (Decimal::from(len) - Decimal::ONE) + tr) / Decimal::from(len));
        }}
        for (key, s) in &self.stoch_states { if s.initialized && self.price_history_highs.len() >= s.k_len {
            let start = self.price_history_highs.len() - s.k_len;
            let mut max_h = h; let mut min_l = l;
            for i in start..self.price_history_highs.len() {
                max_h = max_h.max(self.price_history_highs[i]);
                min_l = min_l.min(self.price_history_lows[i]);
            }
            let k = if max_h == min_l { Decimal::from_str("50.0").unwrap() } else { (c - min_l) / (max_h - min_l) * Decimal::ONE_HUNDRED };
            
            // Calculate D (SMA of K)
            let mut k_sum: Decimal = s.k_buffer.iter().sum();
            if !s.k_buffer.is_empty() && s.k_buffer.len() >= s.d_len { 
                k_sum = k_sum - *s.k_buffer.front().unwrap() + k; 
                out.oscillators.insert(format!("STOCH_{}.d", key), Decimal::from(k_sum / Decimal::from(s.d_len)));
            } else {
                 k_sum += k;
                 out.oscillators.insert(format!("STOCH_{}.d", key), k_sum / Decimal::from(s.k_buffer.len() + 1));
            }
            out.oscillators.insert(format!("STOCH_{}.k", key), k); 
        }}

        // CCI Update
        for (&len, s) in &self.cci_states { if s.initialized && s.tp_buffer.len() >= len {
             let tp = (h + l + c) / Decimal::from(3);
             let sum = s.sum_tp - s.tp_buffer.front().unwrap() + tp;
             let sma = sum / Decimal::from(len);
             
             let mut mean_dev = Decimal::ZERO;
             // Iterate buffer skipping first, adding current
             for i in 1..s.tp_buffer.len() { mean_dev += (s.tp_buffer[i] - sma).abs(); }
             mean_dev += (tp - sma).abs();
             mean_dev /= Decimal::from(len);
             
             let cci = if mean_dev == Decimal::ZERO { Decimal::ZERO } else { (tp - sma) / (Decimal::from_str("0.015").unwrap() * mean_dev) };
             out.oscillators.insert(format!("CCI{}", len), cci);
        }}

        // Advanced Updates
        for (&len, s) in &self.mom_states { if s.initialized && self.price_history_closes.len() >= len + 1 {
            let old = self.price_history_closes[self.price_history_closes.len() - len - 1];
            out.oscillators.insert(format!("MOM{}", len), c - old); 
        }}
        for (&len, s) in &self.volma_states { if s.initialized && self.price_history_volumes.len() >= len {
            let old = self.price_history_volumes[self.price_history_volumes.len() - len];
            out.moving_averages.insert(format!("VolMa{}", len), (s.sum - old + v) / Decimal::from(len));
        }}
        for (&len, s) in &self.wr_states { if s.initialized && self.price_history_highs.len() >= len {
             let start = self.price_history_highs.len() - len;
             let mut max_h = h; let mut min_l = l;
             for i in start..self.price_history_highs.len() {
                 max_h = max_h.max(self.price_history_highs[i]);
                 min_l = min_l.min(self.price_history_lows[i]);
             }
             out.oscillators.insert(format!("WR{}", len), if max_h == min_l { -Decimal::from_str("50.0").unwrap() } else { (max_h - c) / (max_h - min_l) * -Decimal::ONE_HUNDRED });
        }}
        
        // ADX Update
        for (&len, s) in &self.adx_states { if s.initialized {
             let h_curr = h; let l_curr = l; let c_prev = s.prev_close;
             let tr = (h_curr - l_curr).max((h_curr - c_prev).abs()).max((l_curr - c_prev).abs());
             let up = h_curr - s.prev_high; let down = s.prev_low - l_curr;
             let pdm = if up > down && up > Decimal::ZERO { up } else { Decimal::ZERO };
             let ndm = if down > up && down > Decimal::ZERO { down } else { Decimal::ZERO };
             
             // Calculate temporary smoothed values (don't update state)
             let tr_smooth = (s.tr_smooth * (Decimal::from(len) - Decimal::ONE) + tr) / Decimal::from(len);
             let pdm_smooth = (s.pdm_smooth * (Decimal::from(len) - Decimal::ONE) + pdm) / Decimal::from(len);
             let ndm_smooth = (s.ndm_smooth * (Decimal::from(len) - Decimal::ONE) + ndm) / Decimal::from(len);
             
             let pdi = if tr_smooth == Decimal::ZERO { Decimal::ZERO } else { Decimal::ONE_HUNDRED * pdm_smooth / tr_smooth };
             let ndi = if tr_smooth == Decimal::ZERO { Decimal::ZERO } else { Decimal::ONE_HUNDRED * ndm_smooth / tr_smooth };
             let di_sum = pdi + ndi;
             let dx = if di_sum == Decimal::ZERO { Decimal::ZERO } else { Decimal::ONE_HUNDRED * (pdi - ndi).abs() / di_sum };
             
             // ADX Output (smoothed DX)
             let adx = (s.dx_smooth * (Decimal::from(len) - Decimal::ONE) + dx) / Decimal::from(len);
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
             let atr = (s.atr * (Decimal::from(len) - Decimal::ONE) + tr) / Decimal::from(len);
             
             let basic_upper = (h + l) / Decimal::TWO + mult * atr;
             let basic_lower = (h + l) / Decimal::TWO - mult * atr;
             
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
             
             out.volatility.insert(format!("SuperTrend_{}", key), Decimal::from(trend));
             out.volatility.insert(format!("SuperTrend_{}_upper", key), final_upper);
             out.volatility.insert(format!("SuperTrend_{}_lower", key), final_lower);
        }}
        
        // Chop Update
        for (&len, s) in &self.chop_states { if s.initialized && s.tr_buffer.len() >= len {
            let tr = (h - l).max((h - s.prev_close).abs()).max((l - s.prev_close).abs());
            let sum_tr = s.sum_tr - s.tr_buffer.front().unwrap() + tr;
            
            // Find Max High and Min Low (including current)
            let mut max_h = h; let mut min_l = l;
            for &val in &s.highs { max_h = max_h.max(val); }
            for &val in &s.lows { min_l = min_l.min(val); }
            
            let range = max_h - min_l;
            let chop = if range == Decimal::ZERO { Decimal::ZERO } else {
                Decimal::from_f64(100.0 * ((sum_tr / range).to_f64().unwrap().log10()) / Decimal::from(len).to_f64().unwrap().log10()).unwrap()
            };
            out.volatility.insert(format!("CHOP{}", len), chop);
        }}
        
        // MFI Update
        for (&len, s) in &self.mfi_states { if s.initialized && s.pos_flow.len() >= len {
            let tp = (h + l + c) / Decimal::from(3);
            let rmf = tp * v;
            let (p, n) = if tp > s.prev_tp { (rmf, Decimal::ZERO) } else if tp < s.prev_tp { (Decimal::ZERO, rmf) } else { (Decimal::ZERO, Decimal::ZERO) };
            
            let sum_p = s.sum_p - s.pos_flow.front().unwrap_or(&Decimal::ZERO) + p;
            let sum_n = s.sum_n - s.neg_flow.front().unwrap_or(&Decimal::ZERO) + n;
            
            let mfi = if sum_n == Decimal::ZERO { Decimal::ONE_HUNDRED } else { Decimal::ONE_HUNDRED - (Decimal::ONE_HUNDRED / (Decimal::ONE + sum_p / sum_n)) };
            out.oscillators.insert(format!("MFI{}", len), mfi);
        }}
        
        // VWAP Update
        for (key, s) in &self.vwap_states {
            let tp = (h + l + c) / Decimal::from(3);
            let cum_pv = s.cum_pv + tp * v;
            let cum_vol = s.cum_vol + v;
            let vwap = if cum_vol == Decimal::ZERO { Decimal::ZERO } else { cum_pv / cum_vol };
            out.volatility.insert(format!("VWAP_{}", key), vwap);
        }

        serde_json::to_string(&out).unwrap_or(String::from("{}"))
    }

    pub fn shift(&mut self, _o_str: String, h_str: String, l_str: String, c_str: String, v_str: String, _t: f64) {
        let h = Decimal::from_str(&h_str).expect("Invalid decimal string");
        let l = Decimal::from_str(&l_str).expect("Invalid decimal string");
        let c = Decimal::from_str(&c_str).expect("Invalid decimal string");
        let v = Decimal::from_str(&v_str).expect("Invalid decimal string");
        let mut popped_c = None;
        let mut popped_v = None;

        // Update global price history buffers
        if self.price_history_closes.len() >= self.max_history_size {
            popped_c = self.price_history_closes.pop_front();
            self.price_history_highs.pop_front();
            self.price_history_lows.pop_front();
            popped_v = self.price_history_volumes.pop_front();
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
        for (&len, s) in &mut self.vwma_states {
            if s.initialized && self.price_history_closes.len() >= len && self.price_history_volumes.len() >= len {
                let old_close = if self.price_history_closes.len() > len {
                    self.price_history_closes[self.price_history_closes.len() - len - 1]
                } else {
                    popped_c.unwrap_or(Decimal::ZERO)
                };
                let old_vol = if self.price_history_volumes.len() > len {
                    self.price_history_volumes[self.price_history_volumes.len() - len - 1]
                } else {
                    popped_v.unwrap_or(Decimal::ZERO)
                };
                s.sum_pv = s.sum_pv - (old_close * old_vol) + (c * v);
                s.sum_vol = s.sum_vol - old_vol + v;
            }
        }
        
        // HMA Shift (recalculate WMAs)
        for (&len, s) in &mut self.hma_states {
            if s.initialized && self.price_history_closes.len() >= len {
                let half = len / 2;
                
                // Recalculate WMA(n/2)
                let weights_half = (half * (half + 1)) / 2;
                let mut wma_half = Decimal::ZERO;
                for i in 0..half {
                    let idx = self.price_history_closes.len() - half + i;
                    wma_half += self.price_history_closes[idx] * Decimal::from(i + 1);
                }
                s.wma_half = Decimal::from(wma_half / Decimal::from(weights_half));
                
                // Recalculate WMA(n)
                let weights_full = (len * (len + 1)) / 2;
                let mut wma_full = Decimal::ZERO;
                for i in 0..len {
                    let idx = self.price_history_closes.len() - len + i;
                    wma_full += self.price_history_closes[idx] * Decimal::from(i + 1);
                }
                s.wma_full = Decimal::from(wma_full / Decimal::from(weights_full));
            }
        }
        
        for (&len, s) in &mut self.rsi_states { if s.initialized {
            let chg = c - s.prev_close; let g = if chg > Decimal::ZERO { chg } else { Decimal::ZERO }; let l_ = if chg < Decimal::ZERO { -chg } else { Decimal::ZERO };
            s.avg_gain = (s.avg_gain * (Decimal::from(len) - Decimal::ONE) + g) / Decimal::from(len); s.avg_loss = (s.avg_loss * (Decimal::from(len) - Decimal::ONE) + l_) / Decimal::from(len); s.prev_close = c;
        }}
        for (_k, s) in &mut self.macd_states { if s.initialized {
            s.ema_fast = (c - s.ema_fast) * s.k_fast + s.ema_fast; s.ema_slow = (c - s.ema_slow) * s.k_slow + s.ema_slow; s.signal_val = ((s.ema_fast - s.ema_slow) - s.signal_val) * s.k_signal + s.signal_val;
        }}
        for (&len, s) in &mut self.bb_states { if s.initialized && self.price_history_closes.len() >= len {
            let old_price = if self.price_history_closes.len() > len {
                self.price_history_closes[self.price_history_closes.len() - len - 1]
            } else {
                popped_c.unwrap_or(Decimal::ZERO)
            };
            s.sum = s.sum - old_price + c; s.sum_sq = s.sum_sq - (old_price*old_price) + (c*c);
        }}
        for (&len, s) in &mut self.atr_states { if s.initialized {
             let tr = (h - l).max((h - s.prev_close).abs()).max((l - s.prev_close).abs()); s.value = (s.value * (Decimal::from(len) - Decimal::ONE) + tr) / Decimal::from(len); s.prev_close = c;
        }}
        for (_key, s) in &mut self.stoch_states { if s.initialized {
            // Find max_h/min_l over last K periods from global history
            // Global history now includes current h/l at the end
            let hist_len = self.price_history_highs.len();
            let start = if hist_len > s.k_len { hist_len - s.k_len } else { 0 };
            
            let mut max_h = Decimal::MIN; let mut min_l = Decimal::MAX;
            for i in start..hist_len {
                max_h = max_h.max(self.price_history_highs[i]);
                min_l = min_l.min(self.price_history_lows[i]);
            }
            let k = if max_h == min_l { Decimal::from_str("50.0").unwrap() } else { (c - min_l) / (max_h - min_l) * Decimal::ONE_HUNDRED };
            
            s.k_buffer.push_back(k); if s.k_buffer.len() > s.d_len { s.k_buffer.pop_front(); }
            s.d_val = s.k_buffer.iter().sum::<Decimal>() / Decimal::from(s.k_buffer.len().max(1));
        }}
        
        // CCI Shift
        for (&len, s) in &mut self.cci_states { if s.initialized {
            let tp = (h + l + c) / Decimal::from(3);
            s.tp_buffer.push_back(tp);
            s.sum_tp += tp;
            if s.tp_buffer.len() > len { s.sum_tp -= s.tp_buffer.pop_front().unwrap(); }
        }}

        // Advanced Shifts
        for (_len, s) in &mut self.mom_states { if s.initialized { 
            // Momentum no longer needs internal buffer, using global closes
        }}
        for (&len, s) in &mut self.volma_states { if s.initialized && self.price_history_volumes.len() >= len {
            let old_vol = if self.price_history_volumes.len() > len {
                self.price_history_volumes[self.price_history_volumes.len() - len - 1]
            } else {
                popped_v.unwrap_or(Decimal::ZERO)
            };
            s.sum = s.sum - old_vol + v;
        }}
        for (_len, s) in &mut self.wr_states { if s.initialized {
            // WR no longer needs internal buffer, using global highs/lows
        }}
        
        // ADX Shift
        for (&len, s) in &mut self.adx_states { if s.initialized {
             let h_curr = h; let l_curr = l; let c_prev = s.prev_close;
             let tr = (h_curr - l_curr).max((h_curr - c_prev).abs()).max((l_curr - c_prev).abs());
             let up = h_curr - s.prev_high; let down = s.prev_low - l_curr;
             let pdm = if up > down && up > Decimal::ZERO { up } else { Decimal::ZERO };
             let ndm = if down > up && down > Decimal::ZERO { down } else { Decimal::ZERO };
             
             // Update state with permanent values
             s.tr_smooth = (s.tr_smooth * (Decimal::from(len) - Decimal::ONE) + tr) / Decimal::from(len);
             s.pdm_smooth = (s.pdm_smooth * (Decimal::from(len) - Decimal::ONE) + pdm) / Decimal::from(len);
             s.ndm_smooth = (s.ndm_smooth * (Decimal::from(len) - Decimal::ONE) + ndm) / Decimal::from(len);
             
             let pdi = if s.tr_smooth == Decimal::ZERO { Decimal::ZERO } else { Decimal::ONE_HUNDRED * s.pdm_smooth / s.tr_smooth };
             let ndi = if s.tr_smooth == Decimal::ZERO { Decimal::ZERO } else { Decimal::ONE_HUNDRED * s.ndm_smooth / s.tr_smooth };
             let di_sum = pdi + ndi;
             let dx = if di_sum == Decimal::ZERO { Decimal::ZERO } else { Decimal::ONE_HUNDRED * (pdi - ndi).abs() / di_sum };
             
             // Update ADX state
             s.dx_smooth = (s.dx_smooth * (Decimal::from(len) - Decimal::ONE) + dx) / Decimal::from(len);
             
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
             s.atr = (s.atr * (Decimal::from(len) - Decimal::ONE) + tr) / Decimal::from(len);
             
             let basic_upper = (h + l) / Decimal::TWO + mult * s.atr;
             let basic_lower = (h + l) / Decimal::TWO - mult * s.atr;
             
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
        for (&len, s) in &mut self.chop_states { if s.initialized {
            let tr = (h - l).max((h - s.prev_close).abs()).max((l - s.prev_close).abs());
            
            s.tr_buffer.push_back(tr);
            s.sum_tr += tr;
            if s.tr_buffer.len() > len { s.sum_tr -= s.tr_buffer.pop_front().unwrap(); }
            
            s.highs.push_back(h);
            if s.highs.len() > len { s.highs.pop_front(); }
            
            s.lows.push_back(l);
            if s.lows.len() > len { s.lows.pop_front(); }
            
            s.prev_close = c;
        }}
        
        // MFI Shift
        for (&len, s) in &mut self.mfi_states { if s.initialized {
            let tp = (h + l + c) / Decimal::from(3);
            let rmf = tp * v;
            let (p, n) = if tp > s.prev_tp { (rmf, Decimal::ZERO) } else if tp < s.prev_tp { (Decimal::ZERO, rmf) } else { (Decimal::ZERO, Decimal::ZERO) };
            
            s.pos_flow.push_back(p);
            s.sum_p += p;
            if s.pos_flow.len() > len { s.sum_p -= s.pos_flow.pop_front().unwrap(); }
            
            s.neg_flow.push_back(n);
            s.sum_n += n;
            if s.neg_flow.len() > len { s.sum_n -= s.neg_flow.pop_front().unwrap(); }
            
            s.prev_tp = tp;
        }}
        
        // VWAP Shift
        for (_key, s) in &mut self.vwap_states {
            let tp = (h + l + c) / Decimal::from(3);
            s.cum_pv += tp * v;
            s.cum_vol += v;
            // s.last_t = t; // t is not Decimal::from(passed) in shift sig in all versions?
            // Check shift sig: shift(&mut self, _o: f64, h: f64, l: f64, c: f64, v: f64, _t: f64)
            s.last_t = Decimal::from_f64(_t).expect("Invalid decimal string");
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
        let closes: Vec<String> = vec!["100.0".to_string(); 20];
        let highs: Vec<String> = vec!["105.0".to_string(); 20];
        let lows: Vec<String> = vec!["95.0".to_string(); 20];
        let volumes: Vec<String> = vec!["1000.0".to_string(); 20];
        let times: Vec<f64> = vec![0.0; 20];

        // Settings with specific multiplier Decimal::from_str("4.5").unwrap()
        let settings_json = r#"{
            "supertrend": [{ "length": 14, "multiplier": "4.5" }]
        }"#;

        calc.initialize(closes, highs, lows, volumes, times, settings_json);

        // Verify that the state was initialized with the correct multiplier
        // Key is "14-Decimal::from_str("4.5").unwrap()"
        let state = calc.st_states.get("14-4.5").expect(&format!("SuperTrend state should exist. Keys: {:?}", calc.st_states.keys().collect::<Vec<_>>()));

        assert_eq!(state.multiplier, Decimal::from_str("4.5").unwrap(), "Multiplier should be 4.5 as set in settings");
    }
}
pub mod alert_engine; pub mod alert_engine_tests;
pub mod alert_exports;
