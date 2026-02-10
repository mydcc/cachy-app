import re

file_path = "src/utils/indicators.ts"

with open(file_path, "r") as f:
    content = f.read()

# Define the pattern to find the bb function
# We look for "bb(" and then capture until the end of the function.
# Since JS uses braces, we need to count braces to find the end.

start_marker = "  bb("
start_idx = content.find(start_marker)

if start_idx == -1:
    print("Could not find bb function")
    exit(1)

# Find the opening brace of the function body
brace_idx = content.find("{", start_idx)
if brace_idx == -1:
    print("Could not find opening brace")
    exit(1)

# Walk to find matching closing brace
count = 1
end_idx = brace_idx + 1
while count > 0 and end_idx < len(content):
    if content[end_idx] == "{":
        count += 1
    elif content[end_idx] == "}":
        count -= 1
    end_idx += 1

if count != 0:
    print("Could not find matching closing brace")
    exit(1)

# Extract original function (for debug)
original_func = content[start_idx:end_idx]
# print("Original:", original_func)

# Construct new function body
new_body = """  bb(
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

    // Standard Deviation Calculation
    // We use a 2-pass approach (calculate SMA, then calculate variance loop)
    // to avoid catastrophic cancellation errors with high-value assets (e.g. BTC > 100k).
    // The naive method (E[x^2] - (E[x])^2) is O(N) but imprecise.
    // This loop method is O(N*P) which is fine for small P (typically 20).

    for (let i = period - 1; i < len; i++) {
      const avg = sma[i];
      let sumSqDiff = 0;

      // Iterate over the window
      for (let j = 0; j < period; j++) {
        const val = data[i - j];
        const diff = val - avg;
        sumSqDiff += diff * diff;
      }

      const standardDev = Math.sqrt(sumSqDiff / period);
      upper[i] = avg + standardDev * stdDev;
      lower[i] = avg - standardDev * stdDev;
    }
    return { middle: sma, upper, lower };
  }"""

# Replace
new_content = content[:start_idx] + new_body + content[end_idx:]

with open(file_path, "w") as f:
    f.write(new_content)

print("Applied fix successfully")
