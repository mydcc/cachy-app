@group(0) @binding(0) var<storage, read> high_data: array<f32>;
@group(0) @binding(1) var<storage, read> low_data: array<f32>;
@group(0) @binding(2) var<storage, read> close_data: array<f32>;
@group(0) @binding(3) var<storage, read> volume_data: array<f32>;
@group(0) @binding(4) var<storage, read> is_new_session: array<u32>; // 1 = new session
@group(0) @binding(5) var<storage, read_write> output_data: array<f32>;
@group(0) @binding(6) var<uniform> params: Params;

struct Params {
    data_len: u32,
    // No length param needed, runs cumulative
};

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    if (global_id.x > 0) { return; }

    let count = params.data_len;
    
    var cum_pv: f32 = 0.0;
    var cum_v: f32 = 0.0;
    
    for (var i: u32 = 0; i < count; i++) {
        // Check for session reset
        // Usually is_new_session is 1 if time[i] starts new day/session relative to time[i-1]
        if (is_new_session[i] == 1u) {
            cum_pv = 0.0;
            cum_v = 0.0;
        }
        
        let h = high_data[i];
        let l = low_data[i];
        let c = close_data[i];
        let v = volume_data[i];
        
        let tp = (h + l + c) / 3.0;
        
        cum_pv = cum_pv + (tp * v);
        cum_v = cum_v + v;
        
        if (cum_v == 0.0) {
            output_data[i] = tp;
        } else {
            output_data[i] = cum_pv / cum_v;
        }
    }
}
