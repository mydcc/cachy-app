import re

file_path = 'src/components/shared/ThreeBackground.svelte'

with open(file_path, 'r') as f:
    content = f.read()

# 1. Add Culling Variables
culling_vars = """
    let isVisible = true;
    let observer: IntersectionObserver | null = null;

    function startAnimationLoop() {
        if (!animationId && lifecycleState === LifecycleState.READY) {
            animate();
        }
    }

    function stopAnimationLoop() {
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
    }

    function handleVisibilityChange() {
        if (document.hidden) {
            stopAnimationLoop();
        } else if (isVisible) {
            startAnimationLoop();
        }
    }
"""

if 'let isVisible = true' not in content:
    content = content.replace(
        'let highPerfTimeout: ReturnType<typeof setTimeout> | null = null;',
        'let highPerfTimeout: ReturnType<typeof setTimeout> | null = null;\n' + culling_vars
    )

# 2. Update onMount
# We need to insert the observer and listener.
# Searching for 'lifecycleState = LifecycleState.READY;' which is near end of onMount
observer_logic = """
        // Visibility Culling
        observer = new IntersectionObserver(([entry]) => {
            isVisible = entry.isIntersecting;
            if (isVisible && !document.hidden) {
                startAnimationLoop();
            } else {
                stopAnimationLoop();
            }
        });
        observer.observe(container);

        document.addEventListener("visibilitychange", handleVisibilityChange);
"""
if 'observer = new IntersectionObserver' not in content:
    content = content.replace(
        'lifecycleState = LifecycleState.READY;',
        observer_logic + '\n        lifecycleState = LifecycleState.READY;'
    )

# 3. Update Cleanup in onMount return
cleanup_logic = """
            if (observer) observer.disconnect();
            document.removeEventListener("visibilitychange", handleVisibilityChange);
"""
if 'if (observer) observer.disconnect()' not in content:
    content = content.replace(
        'window.removeEventListener("resize", onWindowResize);',
        cleanup_logic + 'window.removeEventListener("resize", onWindowResize);'
    )

# 4. Update disposeAll
# We will prepend the traverse logic to existing disposeAll or replace it?
# Let's replace the beginning of disposeAll to inject traversal.

dispose_replacement = """
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
          resources.renderer.forceContextLoss();
      }

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

# Regex to replace disposeAll
# Assuming it starts with function disposeAll() and ends before onMount or so.
# But since I know the content structure from  and , it's before .
# However, the previous  output showed  around line 263.
# I will use a regex that matches until  to avoid replacing the whole object reset if possible, or just replace the whole function if I can match it.
# The  function body seems to end with  and then .

dispose_regex = r"function disposeAll\(\) \{[\s\S]*?starDustPoints: null\s*\}\s*;\s*\}"
content = re.sub(dispose_regex, dispose_replacement.strip(), content)

with open(file_path, 'w') as f:
    f.write(content)

print("Culling and Safety updates applied.")
