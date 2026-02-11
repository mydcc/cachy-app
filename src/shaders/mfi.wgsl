@group(0) @binding(0) var<storage, read> high_data: array<f32>;
@group(0) @binding(1) var<storage, read> low_data: array<f32>;
@group(0) @binding(2) var<storage, read> close_data: array<f32>;
@group(0) @binding(3) var<storage, read> volume_data: array<f32>;
@group(0) @binding(4) var<storage, read_write> output_data: array<f32>;
@group(0) @binding(5) var<uniform> params: Params;

struct Params {
    length: u32,
    data_len: u32,
};

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let id = global_id.x;
    if (id >= params.data_len) {
        return;
    }

    if (id < params.length) {
        output_data[id] = 50.0;
        return;
    }

    var pos_flow_sum: f32 = 0.0;
    var neg_flow_sum: f32 = 0.0;

    for (var i: u32 = 0; i < params.length; i++) {
        let idx = id - i;
        let h = high_data[idx];
        let l = low_data[idx];
        let c = close_data[idx];
        let v = volume_data[idx];
        let tp = (h + l + c) / 3.0;
        let flow = tp * v;
        
        // Prev TP
        var prev_tp = tp;
        if (idx > 0) {
            let ph = high_data[idx - 1];
            let pl = low_data[idx - 1];
            let pc = close_data[idx - 1];
            prev_tp = (ph + pl + pc) / 3.0;
        }
        
        if (tp > prev_tp) {
            pos_flow_sum = pos_flow_sum + flow;
        } else if (tp < prev_tp) {
            neg_flow_sum = neg_flow_sum + flow;
        }
        // Equal = discard?
    }

    if (neg_flow_sum == 0.0) {
        output_data[id] = 100.0;
    } else {
        let mr = pos_flow_sum / neg_flow_sum;
        output_data[id] = 100.0 - (100.0 / (1.0 + mr));
    }
}
