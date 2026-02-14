@group(0) @binding(0) var<storage, read> high_data: array<f32>;
@group(0) @binding(1) var<storage, read> low_data: array<f32>;
@group(0) @binding(2) var<storage, read> close_data: array<f32>;
@group(0) @binding(3) var<storage, read> atr_data: array<f32>;
@group(0) @binding(4) var<storage, read_write> output_supertrend: array<f32>;
@group(0) @binding(5) var<storage, read_write> output_trend: array<f32>; // 1.0 for Bull, -1.0 for Bear
@group(0) @binding(6) var<uniform> params: Params;

struct Params {
    factor: f32,
    data_len: u32,
};

// Generic compute now supports mixed params via ArrayBuffer and multiple outputs.
// No specialized workaround needed in shader logic, just matching bindings.

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    if (global_id.x > 0) { return; }

    let count = params.data_len;
    let factor = params.factor;

    // Initial state
    var trend = 1.0;
    var upper_band = (high_data[0] + low_data[0]) / 2.0 + factor * atr_data[0];
    var lower_band = (high_data[0] + low_data[0]) / 2.0 - factor * atr_data[0];
    var supertrend = upper_band;

    for (var i: u32 = 0; i < count; i++) {
        let h = high_data[i];
        let l = low_data[i];
        let c = close_data[i];
        let atr = atr_data[i];
        
        let hl2 = (h + l) / 2.0;
        var curr_upper = hl2 + factor * atr;
        var curr_lower = hl2 - factor * atr;
        
        // Logic from JS implementation (likely standard SuperTrend)
        // prev close
        var prev_c = c; 
        if (i > 0) { prev_c = close_data[i - 1]; }
        
        // Stabilize bands
        if (curr_upper < upper_band || prev_c > upper_band) {
            upper_band = curr_upper;
        } else {
            // keep prev upper_band
        }
        
        if (curr_lower > lower_band || prev_c < lower_band) {
            lower_band = curr_lower;
        } else {
            // keep prev lower_band
        }
        
        // Trend Switch
        var prev_supertrend = supertrend;
        if (i > 0) { prev_supertrend = output_supertrend[i - 1]; } // Or just track var
        
        var next_trend = trend;
        
        if (trend == 1.0) {
            if (c < lower_band) {
                next_trend = -1.0;
                supertrend = upper_band;
            } else {
                supertrend = lower_band;
            }
        } else {
            if (c > upper_band) {
                next_trend = 1.0;
                supertrend = lower_band;
            } else {
                supertrend = upper_band;
            }
        }
        
        trend = next_trend;
        
        output_supertrend[i] = supertrend;
        output_trend[i] = trend;
    }
}
