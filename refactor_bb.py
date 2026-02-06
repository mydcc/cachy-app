import sys

new_bb = """  bb(
    data: NumberArray,
    period: number,
    stdDev: number = 2,
    outMiddle?: Float64Array,
    outUpper?: Float64Array,
    outLower?: Float64Array,
  ) {
    const len = data.length;
    const sma = this.sma(data, period, outMiddle);
    const upper = (outUpper && outUpper.length === len) ? outUpper : new Float64Array(len);
    upper.fill(NaN);
    const lower = (outLower && outLower.length === len) ? outLower : new Float64Array(len);
    lower.fill(NaN);

    if (len < period) return { middle: sma, upper, lower };

    // Use stable Two-Pass algorithm (or just re-loop) for Variance to avoid catastrophic cancellation.
    // O(N * Period) is fine for typically small periods (20).
    for (let i = period - 1; i < len; i++) {
      const avg = sma[i];
      let sumSqDiff = 0;

      // Manual loop for variance sum
      for (let j = 0; j < period; j++) {
        const diff = data[i - j] - avg;
        sumSqDiff += diff * diff;
      }

      const standardDev = Math.sqrt(sumSqDiff / period);
      upper[i] = avg + standardDev * stdDev;
      lower[i] = avg - standardDev * stdDev;
    }
    return { middle: sma, upper, lower };
  }"""

with open("src/utils/indicators.ts", "r") as f:
    content = f.read()

# Locate the start of "bb(" inside JSIndicators
start_marker = "bb("
end_marker = "return { middle: sma, upper, lower };"
start_idx = content.find("bb(", content.find("JSIndicators"))
if start_idx == -1:
    print("Could not find bb function")
    sys.exit(1)

return_idx = content.find(end_marker, start_idx)
# Find the closing brace after the return statement
end_brace_idx = content.find("}", return_idx)

if return_idx == -1 or end_brace_idx == -1:
     print("Could not find end of bb function")
     sys.exit(1)

# Preserve the comma if it exists after the function
suffix = content[end_brace_idx+1:]

new_content = content[:start_idx] + new_bb.strip() + content[end_brace_idx+1:]

with open("src/utils/indicators.ts", "w") as f:
    f.write(new_content)
