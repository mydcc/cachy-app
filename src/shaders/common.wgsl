// Common Utility Functions for Technical Indicators

fn get_index(global_id: u32, offset: u32) -> u32 {
    return global_id - offset;
}

// Safe array access (clamps to 0 or returns specific value if needed)
fn safe_get(data: array<f32>, index: u32, len: u32) -> f32 {
    if (index >= len) {
        return 0.0;
    }
    return data[index];
}
