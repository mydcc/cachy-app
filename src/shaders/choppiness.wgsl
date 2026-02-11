// Choppiness Index (CHOP)
// Formula: 100 * LOG10( SUM(TR, n) / ( MaxHigh(n) - MinLow(n) ) ) / LOG10(n)

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

    if (index < len) {
        output_data[index] = 50.0; // Default/Neutral value for warmup period
        return;
    }

    // Calculate over the window [index - len + 1, index] (inclusive)
    // Wait, Choppiness usually looks back 'len' periods. TR sum is over 'len' periods.
    // Range is Max(High, len) - Min(Low, len).

    var sum_tr = 0.0;
    var max_h = -1e38; // Minimal float
    var min_l = 1e38;  // Maximal float

    for (var i: u32 = 0u; i < len; i++) {
        let curr = index - i;
        let h = high_data[curr];
        let l = low_data[curr];

        // Max/Min logic
        if (h > max_h) { max_h = h; }
        if (l < min_l) { min_l = l; }

        // TR Logic
        var tr = h - l;
        if (curr > 0u) {
            let pc = close_data[curr - 1u];
            let tr2 = abs(h - pc);
            let tr3 = abs(l - pc);
            
            if (tr2 > tr) { tr = tr2; }
            if (tr3 > tr) { tr = tr3; }
        }
        
        sum_tr = sum_tr + tr;
    }

    let range = max_h - min_l;
    
    if (range <= 0.000001) {
        output_data[index] = 0.0; // Avoid div by zero
    } else {
        // Log10(x) = log(x) / log(10)
        // Formula: 100 * log10(sum_tr / range) / log10(len)
        // Simplifies to: 100 * log(sum_tr / range) / log(len)  (bases cancel out)
        
        let val = 100.0 * log(sum_tr / range) / log(f32(len));
        output_data[index] = val;
    }
}
