@group(0) @binding(0) var<storage, read> input_data: array<f32>;
@group(0) @binding(1) var<storage, read_write> output_data: array<f32>;
@group(0) @binding(2) var<uniform> params: Params;

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

    var sum: f32 = 0.0;
    var weight_sum: f32 = 0.0;
    
    // WMA: Weighted Moving Average
    // Weights are [1, 2, ..., n]
    // Value = (P1*1 + P2*2 + ... + Pn*n) / (n*(n+1)/2)
    
    // Loop from oldest to newest in window
    // Window: [id - window + 1 ... id]
    
    for (var i: u32 = 0; i < params.window_size; i++) {
        let weight = f32(i + 1);
        let idx = id - params.window_size + 1 + i;
        sum = sum + input_data[idx] * weight;
        weight_sum = weight_sum + weight;
    }

    output_data[id] = sum / weight_sum;
}
