import re

file_path = 'src/components/shared/backgrounds/TradeFlowBackground.svelte'

with open(file_path, 'r') as f:
    content = f.read()

# 1. Culling Variables
culling_vars = """
    let isVisible = true;
    let observer: IntersectionObserver | null = null;

    function startAnimationLoop() {
        if (!rafId && lifecycleState === LifecycleState.READY) {
            animate(performance.now());
        }
    }

    function stopAnimationLoop() {
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
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

# 2. Update onMount (Observer)
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
# Insert before lifecycleState = READY
if 'observer = new IntersectionObserver' not in content:
    content = content.replace(
        'lifecycleState = LifecycleState.READY;',
        observer_logic + '\n      lifecycleState = LifecycleState.READY;'
    )

# 3. Update Cleanup
cleanup_logic = """
    if (observer) observer.disconnect();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
"""
# Insert in cleanup() function
if 'if (observer) observer.disconnect()' not in content:
    content = content.replace(
        'window.removeEventListener(\'mousemove\', onMouseMove);',
        'window.removeEventListener(\'mousemove\', onMouseMove);\n' + cleanup_logic
    )

# 4. Update disposeAll
dispose_replacement = """
  function disposeAll() {
    log(LogLevel.INFO, '🧹 Starting complete cleanup...');

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

    disposeGeometry();
    disposeMaterial();

    if (resources.renderer) {
        // @ts-ignore
        if (resources.renderer.forceContextLoss) resources.renderer.forceContextLoss();
    }

    disposeRenderer();

    resources.scene = null;
    resources.camera = null;
    resources.points = null;
  }
"""

# Regex for disposeAll
dispose_regex = r"function disposeAll\(\) \{[\s\S]*?resources\.points = null;\s*\}"
content = re.sub(dispose_regex, dispose_replacement.strip(), content)

with open(file_path, 'w') as f:
    f.write(content)

print("TradeFlow culling updated.")
