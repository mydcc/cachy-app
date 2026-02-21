import re

file_path = 'src/stores/market.svelte.ts'

with open(file_path, 'r') as f:
    content = f.read()

# 1. Add imports
imports = """import { scheduler } from "../utils/scheduler";
import { idleMonitor } from "../utils/idleMonitor.svelte";
"""
content = content.replace('import { BufferPool } from "../utils/bufferPool";', 'import { BufferPool } from "../utils/bufferPool";\n' + imports)

# 2. Add lastFlushTime property
content = content.replace('private flushIntervalId: any = null;', 'private flushIntervalId: any = null;\n  private lastFlushTime = 0;')

# 3. Replace constructor setInterval
constructor_pattern = r'this.flushIntervalId = setInterval\(\(\) => \{\s+this.flushUpdates\(\);\s+\}, 250\);'
new_constructor = """// Batch flushing loop (RAF-based for better idle performance)
      this.startFlushLoop();"""
content = re.sub(constructor_pattern, new_constructor, content)

# 4. Add startFlushLoop and flushLoop methods
class_end_pattern = r'(  subscribeStatus\(fn: \(value: WSStatus\) => void\) \{[\s\S]+?  \}\n)\}'
new_methods = """  subscribeStatus(fn: (value: WSStatus) => void) {
    fn(this.connectionStatus);
    const cleanup = .root(() => {
      (() => {
        this.connectionStatus; // Track
        untrack(() => {
          if (this.statusNotifyTimer) clearTimeout(this.statusNotifyTimer);
          this.statusNotifyTimer = setTimeout(() => {
            fn(this.connectionStatus);
            this.statusNotifyTimer = null;
          }, 10);
        });
      });
    });
    return () => {
      if (typeof cleanup === 'function') {
        (cleanup as Function)();
      } else if (cleanup && typeof (cleanup as any).stop === 'function') {
        (cleanup as any).stop();
      }
    };
  }

  private startFlushLoop() {
      if (!browser) return;

      const loop = () => {
          this.flushIntervalId = requestAnimationFrame(loop);

          const now = performance.now();
          // Throttle: 250ms normally
          // If idle, throttle to 1000ms to save CPU
          const interval = idleMonitor.isUserIdle ? 1000 : 250;

          if (now - this.lastFlushTime > interval) {
              this.lastFlushTime = now;
              // Only flush if tab is visible (RAF handles this mostly, but double check)
              if (!document.hidden) {
                  this.flushUpdates();
              }
          }
      };

      this.flushIntervalId = requestAnimationFrame(loop);
  }
}"""
# Note: I need to be careful with regex replacement of large blocks.
# Instead, I'll append the new methods before the last closing brace of the class.

# Let's find the last closing brace of the class MarketManager
# It's tricky with nested braces.
# I'll look for  and insert before that.

split_point = 'export const marketState = new MarketManager();'
parts = content.split(split_point)

if len(parts) != 2:
    print("Error: Could not find split point")
    exit(1)

# The class definition ends right before split_point (ignoring whitespace)
# We need to insert the methods inside the class.
# The class likely ends with .
# We can search backwards from the end of parts[0] for the last .

last_brace_index = parts[0].rfind('}')
if last_brace_index == -1:
    print("Error: Could not find class closing brace")
    exit(1)

new_methods_code = """
  private startFlushLoop() {
      if (!browser) return;

      const loop = () => {
          this.flushIntervalId = requestAnimationFrame(loop);

          const now = performance.now();
          // Throttle: 250ms normally
          // If idle, throttle to 1000ms to save CPU
          const interval = idleMonitor.isUserIdle ? 1000 : 250;

          if (now - this.lastFlushTime > interval) {
              this.lastFlushTime = now;
              // Only flush if tab is visible (RAF handles this mostly, but double check)
              if (!document.hidden) {
                  this.flushUpdates();
              }
          }
      };

      this.flushIntervalId = requestAnimationFrame(loop);
  }
"""

# Insert methods
modified_class = parts[0][:last_brace_index] + new_methods_code + parts[0][last_brace_index:]

# 5. Fix destroy method to cancel RAF
# replace  with
modified_class = modified_class.replace('clearInterval(this.flushIntervalId);', 'cancelAnimationFrame(this.flushIntervalId);')

final_content = modified_class + split_point + parts[1]

with open(file_path, 'w') as f:
    f.write(final_content)

print("Successfully modified market.svelte.ts")
