@group(0) @binding(0) var<storage, read> high_data: array<f32>;
@group(0) @binding(1) var<storage, read> low_data: array<f32>;
@group(0) @binding(2) var<storage, read> close_data: array<f32>;
@group(0) @binding(3) var<storage, read> atr_data: array<f32>;
@group(0) @binding(4) var<storage, read_write> output_supertrend: array<f32>;
@group(0) @binding(5) var<storage, read_write> output_trend: array<f32>; // 1.0 bull, -1.0 bear, 0.0 no value yet
@group(0) @binding(6) var<uniform> params: Params;

struct Params {
    factor: f32,
    data_len: u32,
    // The candle the ATR has its first value on. Before it `atr_data` is a 0
    // placeholder, and bands built from it would collapse onto hl2 (BUG-0475).
    seed: u32,
};

// Mirrors `JSIndicators.superTrend`, the path the alert evaluator reads
// (BUG-0458): no value before the seed, the seed candle starts from its basic
// bands in an uptrend, and every later candle ratchets the bands and flips the
// trend on a close through this candle's band.
@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    if (global_id.x > 0) { return; }

    let count = params.data_len;
    let factor = params.factor;
    let seed = params.seed;

    for (var k: u32 = 0; k < min(seed, count); k++) {
        output_supertrend[k] = 0.0;
        output_trend[k] = 0.0;
    }
    if (seed >= count) { return; }

    var upper_band = (high_data[seed] + low_data[seed]) / 2.0 + factor * atr_data[seed];
    var lower_band = (high_data[seed] + low_data[seed]) / 2.0 - factor * atr_data[seed];
    var trend = 1.0;
    output_supertrend[seed] = lower_band;
    output_trend[seed] = trend;

    for (var i: u32 = seed + 1; i < count; i++) {
        let hl2 = (high_data[i] + low_data[i]) / 2.0;
        let basic_upper = hl2 + factor * atr_data[i];
        let basic_lower = hl2 - factor * atr_data[i];
        let prev_close = close_data[i - 1];
        let c = close_data[i];

        // A band only tightens while the close stays inside it, and resets to
        // the basic band once the previous close broke through it.
        if (basic_upper < upper_band || prev_close > upper_band) {
            upper_band = basic_upper;
        }
        if (basic_lower > lower_band || prev_close < lower_band) {
            lower_band = basic_lower;
        }

        // The trend flips on a close through this candle's band. Decided once
        // into `bull` and selected from it, never by re-reading `trend` after
        // assigning it: the Intel Vulkan driver read the stale trend in that
        // second branch and wrote the old band on every flip candle.
        let bull = select(c > upper_band, !(c < lower_band), trend == 1.0);
        trend = select(-1.0, 1.0, bull);
        output_supertrend[i] = select(upper_band, lower_band, bull);
        output_trend[i] = trend;
    }
}
