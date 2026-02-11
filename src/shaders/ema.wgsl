@group(0) @binding(0) var<storage, read> input_data: array<f32>;
@group(0) @binding(1) var<storage, read_write> output_data: array<f32>;
@group(0) @binding(2) var<uniform> params: Params;

struct Params {
    length: u32,
    data_len: u32,
};

// EMA is recursive. We use a single thread (workgroup_size(1)) to process the whole series.
// This serializes execution on the GPU but keeps data local.

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    // Only thread 0 runs this
    if (global_id.x > 0) {
        return;
    }

    let len = params.length;
    let count = params.data_len;
    let alpha = 2.0 / (f32(len) + 1.0);

    // Initial SMA
    var sum: f32 = 0.0;
    for (var i: u32 = 0; i < len; i++) {
        sum = sum + input_data[i];
    }
    var ema = sum / f32(len);
    
    // Fill initial part with SMA (or 0/undefined before that)
    // Actually standard EMA starts at index 'len-1' with SMA.
    // For 0 to len-2, usually null or undefined. We can put 0.
    
    for (var i: u32 = 0; i < len - 1; i++) {
        output_data[i] = 0.0; // Or input_data[i]?
    }
    
    output_data[len - 1] = ema;

    // Loop for rest
    for (var i: u32 = len; i < count; i++) {
        let price = input_data[i];
        ema = alpha * price + (1.0 - alpha) * ema;
        output_data[i] = ema;
    }
}
