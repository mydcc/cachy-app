@group(0) @binding(0) var<storage, read> close_data: array<f32>;
@group(0) @binding(1) var<storage, read> volume_data: array<f32>;
@group(0) @binding(2) var<storage, read_write> output_data: array<f32>;
@group(0) @binding(3) var<uniform> params: Params;

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

    var vp_sum: f32 = 0.0;
    var v_sum: f32 = 0.0;

    for (var i: u32 = 0; i < params.window_size; i++) {
        let idx = id - i;
        let c = close_data[idx];
        let v = volume_data[idx];
        
        vp_sum = vp_sum + (c * v);
        v_sum = v_sum + v;
    }

    if (v_sum == 0.0) {
        output_data[id] = close_data[id]; 
    } else {
        output_data[id] = vp_sum / v_sum;
    }
}
