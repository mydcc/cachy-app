import re

path = "src/components/shared/MarketOverview.svelte"
with open(path, "r") as f:
    content = f.read()

# 1. Add onMount import
if "import { onMount } from" not in content:
    content = content.replace('import { fade } from "svelte/transition";', 'import { fade } from "svelte/transition";\n  import { onMount } from "svelte";')

# 2. Add state variables
# Find "let isInitialLoad = $state(true);"
state_marker = "let isInitialLoad = $state(true);"
new_state = """let isInitialLoad = $state(true);
  let rootElement: HTMLElement | undefined = $state();
  let isVisible = $state(false);"""

content = content.replace(state_marker, new_state)

# 3. Add onMount IntersectionObserver logic
# Insert before "// Price Flashing & Trend Logic"
logic_marker = "// Price Flashing & Trend Logic"
observer_logic = """
  onMount(() => {
    if (!rootElement) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        isVisible = true;
        observer.disconnect(); // Trigger once
      }
    }, { rootMargin: "200px" }); // Pre-fetch slightly before view

    observer.observe(rootElement);
    return () => observer.disconnect();
  });

"""
content = content.replace(logic_marker, observer_logic + logic_marker)

# 4. Bind element to div
# Find <div class="visual-bar-card"> ... Wait no, it's MarketOverview.
# The template starts after script.
# Look for <div ... class="... market-overview-card ...">
# or just the first div in template?
# Scanning file content...
# It seems the root div has class="market-overview-card" in style block, but let's find it in template.
# It usually starts with <div
# I'll search for the main wrapper.

# In the head -n 150 output, I didn't see the template start except <script>.
# In the sed 150-300 output, I see generic code.
# The template is likely after the script tag closing.

# Let's find </script> and the first <div following it.
script_end_idx = content.rfind("</script>")
if script_end_idx != -1:
    # Search for first <div after script_end_idx
    div_idx = content.find("<div", script_end_idx)
    if div_idx != -1:
        # Insert bind:this={rootElement}
        # e.g. <div class="..." -> <div bind:this={rootElement} class="..."
        # Check if it already has attributes
        insertion_point = div_idx + 4 # length of "<div"
        content = content[:insertion_point] + " bind:this={rootElement}" + content[insertion_point:]
    else:
        print("Could not find root div")
else:
    print("Could not find script end")

# 5. Update Cache Warming effect
# Original:
#   $effect(() => {
#     if (isFavoriteTile && symbol) {
#       untrack(() => {
#         marketWatcher.ensureHistory(symbol, "1h");
#       });
#     }
#   });

warming_regex = r'\$effect\(\(\) => \{\s+if \(isFavoriteTile && symbol\) \{\s+untrack\(\(\) => \{\s+marketWatcher\.ensureHistory\(symbol, "1h"\);\s+\}\);\s+\}\s+\}\);'

warming_replacement = """$effect(() => {
    // Lazy load history only when visible to prevent fetch storm
    if (isFavoriteTile && symbol && isVisible) {
      untrack(() => {
        marketWatcher.ensureHistory(symbol, "1h");
      });
    }
  });"""

# Use regex sub
match = re.search(warming_regex, content)
if match:
    content = content.replace(match.group(0), warming_replacement)
else:
    print("Could not find cache warming effect")
    # Debug
    # print(content[-1000:])

with open(path, "w") as f:
    f.write(content)

print("Optimized MarketOverview.svelte")
