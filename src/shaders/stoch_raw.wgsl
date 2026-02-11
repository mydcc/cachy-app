@group(0) @binding(0) var<storage, read> high_data: array<f32>;
@group(0) @binding(1) var<storage, read> low_data: array<f32>;
@group(0) @binding(2) var<storage, read> close_data: array<f32>;
@group(0) @binding(3) var<storage, read_write> k_line: array<f32>;
@group(0) @binding(4) var<storage, read_write> d_line: array<f32>;
@group(0) @binding(5) var<uniform> params: Params;

struct Params {
    k_len: u32,
    k_smooth: u32,
    d_len: u32,
    data_len: u32,
};

// Stochastic is tricky because it has multiple outputs (K and D) and inputs (H, L, C).
// Our generic compute currently supports 1 output and N inputs. 
// We can run this in 2 passes or update generic compute.
// For now, let's implement just the %K calculation (Raw K) in one shader.
// %D is just an SMA of %K. We can reuse the SMA shader for that!
// So this shader only calculates Raw %K.

// Actually, typical Stoch is:
// 1. Raw %K = (Close - LowestLow) / (HighestHigh - LowestLow) * 100
// 2. Smooth %K = SMA(Raw %K, k_smooth)
// 3. %D = SMA(Smooth %K, d_len)

// So we only need a shader for "Raw %K". 
// Inputs: High, Low, Close.
// Output: Raw %K.

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let id = global_id.x;
    if (id >= params.data_len) {
        return;
    }

    if (id < params.k_len - 1) {
        k_line[id] = 50.0; // Default or 0
        return;
    }

    // Find Min Low and Max High in window
    var min_low: f32 = 10000000.0; // Init high
    var max_high: f32 = 0.0;       // Init low
    
    for (var i: u32 = 0; i < params.k_len; i++) {
        let idx = id - i;
        let h = high_data[idx];
        let l = low_data[idx];
        
        if (h > max_high) { max_high = h; }
        if (l < min_low) { min_low = l; }
    }
    
    let current_close = close_data[id];
    let diff = max_high - min_low;
    
    if (diff == 0.0) {
        k_line[id] = 50.0;
    } else {
        k_line[id] = ((current_close - min_low) / diff) * 100.0;
    }
}
