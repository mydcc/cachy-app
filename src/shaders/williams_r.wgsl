// Williams %R
// Formula: %R = (Highest High - Close) / (Highest High - Lowest Low) * -100

@group(0) @binding(0) var<storage, read> high_data: array<f32>;
@group(0) @binding(1) var<storage, read> low_data: array<f32>;
@group(0) @binding(2) var<storage, read> close_data: array<f32>;
@group(0) @binding(3) var<storage, read_write> output_data: array<f32>;
@group(0) @binding(4) var<uniform> params: Params;

struct Params {
    length: u32,
    count: u32,
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    let len = params.length;
    let count = params.count;

    if (index >= count) {
        return;
    }
    
    if (index < len - 1u) {
        output_data[index] = -50.0;
        return;
    }
    
    var max_h = -1e38;
    var min_l = 1e38;
    
    for (var i: u32 = 0u; i < len; i++) {
        let curr = index - i;
        let h = high_data[curr];
        let l = low_data[curr];
        
        if (h > max_h) { max_h = h; }
        if (l < min_l) { min_l = l; }
    }
    
    let c = close_data[index];
    let range = max_h - min_l;
    
    if (range < 0.00001) {
        output_data[index] = 0.0;
    } else {
        output_data[index] = ((max_h - c) / range) * -100.0;
    }
}
