import re

path = "src/workers/technicals.worker.ts"
with open(path, "r") as f:
    content = f.read()

# Target the Legacy Path block in handleCalculate
# It looks like:
#     } else {
#       // Legacy Path (Object Array)
#       const calculatePayload = payload as WorkerCalculatePayload;
#       const { klines, settings, enabledIndicators } = calculatePayload;
#
#       const klinesDec = convertToDecimalKlines(klines);
#       result = calculateAllIndicators(klinesDec, settings, enabledIndicators);
#     }

start_marker = "      // Legacy Path (Object Array)"
end_marker = "    }"

# We want to replace the body of this else block.
# Since regex across multiple lines with braces is hard, I will use Python string manipulation.

start_idx = content.find(start_marker)
if start_idx == -1:
    print("Could not find start marker")
    exit(1)

# Find the closing brace of the else block.
# The indentation of "      // Legacy" implies it's inside the else block.
# The "else {" is likely before it.

# Let's search for the block explicitly.
block_regex = r'\} else \{\s+// Legacy Path \(Object Array\)[\s\S]*?result = calculateAllIndicators\(klinesDec, settings, enabledIndicators\);\s+\}'

new_block = """} else {
      // Legacy Path (Object Array) - OPTIMIZED (Zero-Allocation Mode)
      const calculatePayload = payload as WorkerCalculatePayload;
      const { klines, settings, enabledIndicators } = calculatePayload;

      // Direct parsing to pool (bypassing Decimal creation)
      const len = klines.length;
      const times = pool.acquire(len);
      const opens = pool.acquire(len);
      const highs = pool.acquire(len);
      const lows = pool.acquire(len);
      const closes = pool.acquire(len);
      const volumes = pool.acquire(len);

      try {
          for (let i = 0; i < len; i++) {
              const k = klines[i];
              times[i] = k.time;
              opens[i] = parseFloat(k.open);
              highs[i] = parseFloat(k.high);
              lows[i] = parseFloat(k.low);
              closes[i] = parseFloat(k.close);
              volumes[i] = parseFloat(k.volume);
          }

          result = calculateIndicatorsFromArrays(
              times,
              opens,
              highs,
              lows,
              closes,
              volumes,
              settings,
              enabledIndicators,
              pool
          );
      } finally {
          pool.release(times);
          pool.release(opens);
          pool.release(highs);
          pool.release(lows);
          pool.release(closes);
          pool.release(volumes);
      }
    }"""

# Replace
match = re.search(block_regex, content)
if match:
    content = content.replace(match.group(0), new_block)
    with open(path, "w") as f:
        f.write(content)
    print("Optimized technicals.worker.ts")
else:
    print("Could not match regex for Legacy Path")
    # Debug: print context
    print(content[start_idx-20:start_idx+200])
