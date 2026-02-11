@group(0) @binding(0) var<storage, read> high_data: array<f32>;
@group(0) @binding(1) var<storage, read> low_data: array<f32>;
@group(0) @binding(2) var<storage, read> close_data: array<f32>;
@group(0) @binding(3) var<storage, read_write> output_data: array<f32>;
@group(0) @binding(4) var<uniform> params: Params;

struct Params {
    length: u32,
    data_len: u32,
};

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    if (global_id.x > 0) { return; }

    let len = params.length;
    let count = params.data_len;
    
    if (count <= len) { return; }
    
    // Initial TR Sum (SMA)
    // First value TR is High - Low (no previous close)
    var tr = high_data[0] - low_data[0];
    var sum_tr = tr;

    // Use loop to calculate initial SMA (first 'len' periods)
    // Actually Wilder's smoothing start point varies, usually SMA of first 'len' TRs.
    
    for (var i: u32 = 1; i < len; i++) {
        let h = high_data[i];
        let l = low_data[i];
        let pc = close_data[i-1];
        
        let tr1 = h - l;
        let tr2 = abs(h - pc);
        let tr3 = abs(l - pc);
        
        tr = tr1;
        if (tr2 > tr) { tr = tr2; }
        if (tr3 > tr) { tr = tr3; }
        
        sum_tr = sum_tr + tr;
    }
    
    var atr = sum_tr / f32(len);
    
    // Fill initial part
    for (var k: u32 = 0; k < len; k++) {
        output_data[k] = 0.0;
    }
    output_data[len - 1] = atr;

    // Recursive Loop
    for (var i: u32 = len; i < count; i++) {
        let h = high_data[i];
        let l = low_data[i];
        let pc = close_data[i-1];
        
        let tr1 = h - l;
        let tr2 = abs(h - pc);
        let tr3 = abs(l - pc);
        
        tr = tr1;
        if (tr2 > tr) { tr = tr2; }
        if (tr3 > tr) { tr = tr3; }
        
        // RMA: (Previous ATR * (n - 1) + TR) / n
        atr = (atr * (f32(len) - 1.0) + tr) / f32(len);
        
        output_data[i] = atr;
    }
}
