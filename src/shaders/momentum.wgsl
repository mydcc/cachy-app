// Momentum
// Formula: MOM = Close - Close(n periods ago)

@group(0) @binding(0) var<storage, read> close_data: array<f32>;
@group(0) @binding(1) var<storage, read_write> output_data: array<f32>;
@group(0) @binding(2) var<uniform> params: Params;

struct Params {
    length: u32,
    count: u32,
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    let len = params.length;
    let count = params.count;

    if (index >= count) { return; }
    
    if (index < len) {
        output_data[index] = 0.0;
        return;
    }
    
    // safe access check implicitly handled by index logic
    let prev_idx = index - len;
    output_data[index] = close_data[index] - close_data[prev_idx];
}
