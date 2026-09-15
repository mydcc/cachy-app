@group(0) @binding(0) var<storage, read> high_data: array<f32>;
@group(0) @binding(1) var<storage, read> low_data: array<f32>;
@group(0) @binding(2) var<storage, read> close_data: array<f32>;
@group(0) @binding(3) var<storage, read_write> k_line: array<f32>;
@group(0) @binding(4) var<uniform> params: Params;

struct Params {
    k_len: u32,
    data_len: u32,
};

// Stochastic Raw %K Calculation
// Inputs: High, Low, Close.
// Output: Raw %K.
// %D and Smooth %K are calculated via subsequent SMA passes on CPU/GPU.

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

    // Find Min Low and Max High in window. Both start from the window's newest
    // candle rather than a constant: a fixed start is a price no window can
    // cross, and a start of 10,000,000 left every low above it unseen (BUG-0476).
    var min_low: f32 = low_data[id];
    var max_high: f32 = high_data[id];

    for (var i: u32 = 1; i < params.k_len; i++) {
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
