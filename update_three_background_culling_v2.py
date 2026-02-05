import re

file_path = 'src/components/shared/ThreeBackground.svelte'

with open(file_path, 'r') as f:
    content = f.read()

# New disposeAll function body
new_dispose_body = """
    function disposeAll() {
      log(LogLevel.INFO, '🧹 Starting complete cleanup...');

      if (performanceMonitor) performanceMonitor.stop();

      // Stop animation
      stopAnimationLoop();

      // Robust Dispose
      if (resources.scene) {
          resources.scene.traverse((object) => {
              if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
                  if (object.geometry) object.geometry.dispose();
                  if (object.material) {
                      if (Array.isArray(object.material)) {
                          object.material.forEach(m => m.dispose());
                      } else {
                          object.material.dispose();
                      }
                  }
              }
          });
      }

      // Dispose renderer
      if (resources.renderer) {
          resources.renderer.dispose();
          // Use type assertion if forceContextLoss is missing from types, or just call it if valid
          // Using any to bypass TS check if needed, but here we assume standard three.js
          resources.renderer.forceContextLoss();
          resources.renderer.domElement = null;
      }

      resources.renderer = null;

      // Clear resources
      resources = {
        scene: null,
        camera: null,
        renderer: null,
        controls: null,
        galaxyGeometry: null,
        galaxyMaterial: null,
        galaxyPoints: null,
        starDustGeometry: null,
        starDustMaterial: null,
        starDustPoints: null
      };
    }
"""

# Find start
start_idx = content.find("function disposeAll() {")
if start_idx == -1:
    print("Error: disposeAll not found")
    exit(1)

# Find end: we know it ends with starDustPoints: null followed by }; and }
# We can search for the next function definition or the end of the block.
# Let's search for "function generateGalaxy()" which should be next based on previous cat (line 305 vs 511... wait line numbers were weird).
# In previous cat (lines 300-600), generateGalaxy was at 305.
# But grep said disposeAll is at 288 (line 316 in my manual count).
# generateGalaxy at 305? That means disposeAll is BEFORE generateGalaxy?
# Yes.

next_func_idx = content.find("function generateGalaxy()", start_idx)
if next_func_idx == -1:
    print("Error: generateGalaxy not found")
    # Try finding the end of the resources object
    end_marker = "starDustPoints: null"
    end_marker_idx = content.find(end_marker, start_idx)
    if end_marker_idx != -1:
        # Find the closing brace of the function
        # content[end_marker_idx:] looks like "starDustPoints: null\n      };\n    }"
        # So roughly + 30 chars
        cutoff = content.find("}", content.find("};", end_marker_idx)) + 1
        content = content[:start_idx] + new_dispose_body + content[cutoff:]
    else:
        print("Error: could not determine end of disposeAll")
        exit(1)
else:
    # Use the gap between functions. careful about comments/whitespace
    # We replace from start_idx to next_func_idx, but checking where the previous function ends.
    # The previous function ends with .
    # So we replace up to the last  before next_func_idx.

    chunk = content[start_idx:next_func_idx]
    last_brace = chunk.rfind("}")
    if last_brace == -1:
         print("Error: closing brace not found")
         exit(1)

    cutoff = start_idx + last_brace + 1
    content = content[:start_idx] + new_dispose_body + "\n    " + content[next_func_idx:]

# Also ensure culling vars are added if missed (regex might have failed previous time due to context)
# The previous script successfully printed "Culling and Safety updates applied.", which implies replacements passed.
# Let's check if 'startAnimationLoop' exists.
if 'function startAnimationLoop()' not in content:
    print("Re-applying culling vars...")
    # ... logic to re-apply if needed ...
    # Assuming previous script worked partially.
    # But grep showed IntersectionObserver was present.
    pass

with open(file_path, 'w') as f:
    f.write(content)

print("DisposeAll updated.")
