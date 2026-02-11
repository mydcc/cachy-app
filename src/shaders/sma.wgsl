// SMA Compute Shader

struct Params {
  window_size: u32,
  data_len: u32,
};

@group(0) @binding(0) var<storage, read> input_data: array<f32>;
@group(0) @binding(1) var<storage, read_write> output_data: array<f32>;
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let index = global_id.x;
  
  // Bounds check
  if (index >= params.data_len) {
    return;
  }
  
  // Check if we have enough history for the window
  if (index < params.window_size - 1) {
    output_data[index] = 0.0; // Or NaN? 0.0 for now to match WASM/TS behavior often
    return;
  }
  
  var sum: f32 = 0.0;
  
  // Naive summation loop (O(N*M))
  // For production with large windows, parallel reduction/scan is better,
  // but for typical TA windows (14-200), this is blazingly fast on GPU vs CPU.
  for (var i: u32 = 0u; i < params.window_size; i = i + 1u) {
    sum = sum + input_data[index - i];
  }
  
  output_data[index] = sum / f32(params.window_size);
}
