@group(0) @binding(0) var<storage, read> input_data: array<f32>;
@group(0) @binding(1) var<storage, read_write> output_data: array<f32>;
@group(0) @binding(2) var<uniform> params: Params;

struct Params {
    length: u32,
    data_len: u32,
};

// RSI is also recursive (Smoothed Avg Gain/Loss).
// Uses Serial Loop strategy.

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    if (global_id.x > 0) { return; }

    let len = params.length;
    let count = params.data_len;
    
    if (count <= len) { return; }

    // 1. Initial Avg Gain/Loss (SMA first)
    var gain_sum: f32 = 0.0;
    var loss_sum: f32 = 0.0;

    for (var i: u32 = 1; i <= len; i++) {
        let change = input_data[i] - input_data[i - 1];
        if (change > 0.0) {
            gain_sum = gain_sum + change;
        } else {
            loss_sum = loss_sum - change; // Abs value
        }
    }

    var avg_gain = gain_sum / f32(len);
    var avg_loss = loss_sum / f32(len);

    // Initial RSI
    var rs = 0.0;
    if (avg_loss == 0.0) {
        output_data[len] = 100.0;
    } else {
        rs = avg_gain / avg_loss;
        output_data[len] = 100.0 - (100.0 / (1.0 + rs));
    }

    // 0..len-1 are undefined
    for (var i: u32 = 0; i < len; i++) {
        output_data[i] = 0.0; 
    }

    // 2. Loop (Wilder's Smoothing)
    // AvgGain = (PreviousAvgGain * (len - 1) + CurrentGain) / len
    
    for (var i: u32 = len + 1; i < count; i++) {
        let change = input_data[i] - input_data[i - 1];
        var gain: f32 = 0.0;
        var loss: f32 = 0.0;
        
        if (change > 0.0) { gain = change; }
        else { loss = -change; }
        
        avg_gain = (avg_gain * f32(len - 1) + gain) / f32(len);
        avg_loss = (avg_loss * f32(len - 1) + loss) / f32(len);
        
        if (avg_loss == 0.0) {
            output_data[i] = 100.0;
        } else {
            rs = avg_gain / avg_loss;
            output_data[i] = 100.0 - (100.0 / (1.0 + rs));
        }
    }
}
