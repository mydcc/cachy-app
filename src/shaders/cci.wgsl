@group(0) @binding(0) var<storage, read> high_data: array<f32>;
@group(0) @binding(1) var<storage, read> low_data: array<f32>;
@group(0) @binding(2) var<storage, read> close_data: array<f32>;
@group(0) @binding(3) var<storage, read_write> output_data: array<f32>;
@group(0) @binding(4) var<uniform> params: Params;

struct Params {
    window_size: u32,
    data_len: u32,
};

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let id = global_id.x;
    if (id >= params.data_len) {
        return;
    }

    if (id < params.window_size - 1) {
        output_data[id] = 0.0;
        return;
    }

    // 1. Calculate Typical Price (TP)
    let h = high_data[id];
    let l = low_data[id];
    let c = close_data[id];
    let tp = (h + l + c) / 3.0;

    // 2. Calculate SMA of TP over window
    var sum_tp: f32 = 0.0;
    
    // We need historical TP values.
    // Re-calculating TP for the window history is inefficient but necessary if we don't pass TP buffer.
    // Better to calculate TP on the fly.
    
    for (var i: u32 = 0; i < params.window_size; i++) {
        let idx = id - i;
        let p_h = high_data[idx];
        let p_l = low_data[idx];
        let p_c = close_data[idx];
        sum_tp = sum_tp + (p_h + p_l + p_c) / 3.0;
    }
    let sma_tp = sum_tp / f32(params.window_size);

    // 3. Calculate Mean Deviation
    var sum_dev: f32 = 0.0;
    for (var i: u32 = 0; i < params.window_size; i++) {
        let idx = id - i;
        let p_h = high_data[idx];
        let p_l = low_data[idx];
        let p_c = close_data[idx];
        let p_tp = (p_h + p_l + p_c) / 3.0;
        
        sum_dev = sum_dev + abs(p_tp - sma_tp);
    }
    let md = sum_dev / f32(params.window_size);

    // 4. Output CCI
    // CCI = (TP - SMA_TP) / (0.015 * MD)
    if (md == 0.0) {
        output_data[id] = 0.0;
    } else {
        output_data[id] = (tp - sma_tp) / (0.015 * md);
    }
}
