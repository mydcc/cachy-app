@group(0) @binding(0) var<storage, read> input_data: array<f32>;
@group(0) @binding(1) var<storage, read_write> output_data: array<f32>;
@group(0) @binding(2) var<uniform> params: Params;

struct Params {
    window_size: u32,
    data_len: u32,
    std_dev_multiplier: f32, // Passed as u32 bits usually, but let's assume valid float in struct
};

// Note: params buffer in WebGpuCalculator is Uint32Array. 
// We need to match layout. 
// If we pass floats, we need to handle that in TS.
// For now, let's assume we update TS to support float params mix.

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let id = global_id.x;
    if (id >= params.data_len) {
        return;
    }

    if (id < params.window_size - 1) {
        output_data[id] = 0.0; // Or keep input? Usually BB Middle is SMA
        return;
    }

    // 1. Calculate SMA (Middle Band)
    var sum: f32 = 0.0;
    for (var i: u32 = 0; i < params.window_size; i++) {
        sum = sum + input_data[id - i];
    }
    let sma = sum / f32(params.window_size);

    // 2. Calculate Standard Deviation
    var sum_sq_diff: f32 = 0.0;
    for (var i: u32 = 0; i < params.window_size; i++) {
        let diff = input_data[id - i] - sma;
        sum_sq_diff = sum_sq_diff + (diff * diff);
    }
    let variance = sum_sq_diff / f32(params.window_size);
    let std_dev = sqrt(variance);

    // 3. Output
    // This shader calculates just One band? Or Middle?
    // Usually BB returns 3 values: Upper, Middle, Lower.
    // Our Architecture expects 1 output array.
    // So we might need 3 separate calls or a struct output buffer.
    // For simplicity, let's implement just the "Width" or "Upper" pending design.
    // Actually, 'bb' indicator in TS returns { upper, middle, lower }.
    
    // DECISION: We will write 3 separate shaders or use one shader writing to 3 output buffers.
    // Generic compute supports multiple OUTPUT buffers if we extend it.
    // Current generic `compute` has 1 output buffer.
    // Let's implement calculating just the Middle (SMA) and let TS handle Up/Low?
    // No, that defeats GPU purpose.
    
    // We will Implement "BB Width" or similar single value?
    // No, we need full BB. 
    // Plan: We can pack all 3 into one buffer (interleaved)? Or just run 3 times?
    // Interleaved [M, U, L, M, U, L...] is good but complex for TS to parse back to separate arrays.
    
    // Start with SMA (Middle) - already have.
    // Upper = SMA + dev * k
    // Lower = SMA - dev * k
    
    // Let's write `bb_middle.wgsl`, `bb_upper.wgsl`, `bb_lower.wgsl`? 
    // Inefficient recalculation.
    
    // Better: Update `compute` to allow multiple outputs.
    // Or, for now, output just the StdDev and let TS do (SMA + StdDev).
    // Operations on arrays in TS are fast. StdDev calc is the heavy part (loop).
    
    output_data[id] = std_dev;
}
