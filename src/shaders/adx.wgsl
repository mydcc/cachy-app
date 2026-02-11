@group(0) @binding(0) var<storage, read> high_data: array<f32>;
@group(0) @binding(1) var<storage, read> low_data: array<f32>;
@group(0) @binding(2) var<storage, read> close_data: array<f32>;
@group(0) @binding(3) var<storage, read_write> output_data: array<f32>;
@group(0) @binding(4) var<uniform> params: Params;

struct Params {
    length: u32, // adx_smoothing (usually same as di_length)
    data_len: u32,
};

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    if (global_id.x > 0) { return; }

    let len = params.length;
    let count = params.data_len;
    
    if (count <= len * 2) { return; } 
    
    var sm_tr: f32 = 0.0;
    var sm_pdm: f32 = 0.0;
    var sm_ndm: f32 = 0.0;
    
    // 1. Initial Sums (First 'len')
    for (var i: u32 = 1; i <= len; i++) {
        let h = high_data[i];
        let l = low_data[i];
        let pc = close_data[i-1];
        
        let tr1 = h - l;
        let tr2 = abs(h - pc);
        let tr3 = abs(l - pc);
        var tr = tr1;
        if (tr2 > tr) { tr = tr2; }
        if (tr3 > tr) { tr = tr3; }
        
        let up_move = h - high_data[i-1];
        let down_move = low_data[i-1] - l;
        var pdm = 0.0;
        var ndm = 0.0;
        if (up_move > down_move && up_move > 0.0) { pdm = up_move; }
        if (down_move > up_move && down_move > 0.0) { ndm = down_move; }
        
        sm_tr = sm_tr + tr;
        sm_pdm = sm_pdm + pdm;
        sm_ndm = sm_ndm + ndm;
    }
    
    // Initial DX at index 'len'
    var pdi = 0.0;
    var ndi = 0.0;
    if (sm_tr > 0.0) {
        pdi = 100.0 * sm_pdm / sm_tr;
        ndi = 100.0 * sm_ndm / sm_tr;
    }
    var dx = 0.0;
    if (pdi + ndi > 0.0) {
        dx = 100.0 * abs(pdi - ndi) / (pdi + ndi);
    }
    
    // We need to accumulate DX for ADX initial smoothing
    var sum_dx: f32 = dx;
    
    // Loop 2: Generate next 'len-1' DXs to get enough for initial ADX
    // Index len+1 to 2*len-1
    
    for (var i: u32 = len + 1; i < 2 * len; i++) {
        let h = high_data[i];
        let l = low_data[i];
        let pc = close_data[i-1];
        
        let tr1 = h - l;
        let tr2 = abs(h - pc);
        let tr3 = abs(l - pc);
        var tr = tr1;
        if (tr2 > tr) { tr = tr2; }
        if (tr3 > tr) { tr = tr3; }
        
        let up_move = h - high_data[i-1];
        let down_move = low_data[i-1] - l;
        var pdm = 0.0;
        var ndm = 0.0;
        if (up_move > down_move && up_move > 0.0) { pdm = up_move; }
        if (down_move > up_move && down_move > 0.0) { ndm = down_move; }
        
        // Wilder's Smoothing: Prev - Prev/n + Curr
        sm_tr = sm_tr - (sm_tr / f32(len)) + tr;
        sm_pdm = sm_pdm - (sm_pdm / f32(len)) + pdm;
        sm_ndm = sm_ndm - (sm_ndm / f32(len)) + ndm;
        
        pdi = 0.0;
        ndi = 0.0;
        if (sm_tr > 0.0) {
            pdi = 100.0 * sm_pdm / sm_tr;
            ndi = 100.0 * sm_ndm / sm_tr;
        }
        dx = 0.0;
        if (pdi + ndi > 0.0) {
            dx = 100.0 * abs(pdi - ndi) / (pdi + ndi);
        }
        
        sum_dx = sum_dx + dx;
        output_data[i] = 0.0; // Still initializing
    }
    
    // Initial ADX at 2*len - 1
    var adx = sum_dx / f32(len);
    output_data[2 * len - 1] = adx;
    
    // Loop 3: Calculating rest of ADX
    for (var i: u32 = 2 * len; i < count; i++) {
        let h = high_data[i];
        let l = low_data[i];
        let pc = close_data[i-1];
        
        let tr1 = h - l;
        let tr2 = abs(h - pc);
        let tr3 = abs(l - pc);
        var tr = tr1;
        if (tr2 > tr) { tr = tr2; }
        if (tr3 > tr) { tr = tr3; }
        
        let up_move = h - high_data[i-1];
        let down_move = low_data[i-1] - l;
        var pdm = 0.0;
        var ndm = 0.0;
        if (up_move > down_move && up_move > 0.0) { pdm = up_move; }
        if (down_move > up_move && down_move > 0.0) { ndm = down_move; }
        
        sm_tr = sm_tr - (sm_tr / f32(len)) + tr;
        sm_pdm = sm_pdm - (sm_pdm / f32(len)) + pdm;
        sm_ndm = sm_ndm - (sm_ndm / f32(len)) + ndm;
        
        pdi = 0.0;
        ndi = 0.0;
        if (sm_tr > 0.0) {
            pdi = 100.0 * sm_pdm / sm_tr;
            ndi = 100.0 * sm_ndm / sm_tr;
        }
        dx = 0.0;
        if (pdi + ndi > 0.0) {
            dx = 100.0 * abs(pdi - ndi) / (pdi + ndi);
        }
        
        // ADX Smoothing: (PrevADX * (n-1) + DX) / n
        adx = (adx * (f32(len) - 1.0) + dx) / f32(len);
        output_data[i] = adx;
    }
}
