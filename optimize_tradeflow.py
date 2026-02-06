import re

file_path = 'src/components/shared/backgrounds/TradeFlowBackground.svelte'

with open(file_path, 'r') as f:
    content = f.read()

# 1. Import
if 'import { PerformanceMonitor }' not in content:
    content = content.replace(
        'import { bitunixWs } from "../../../services/bitunixWs";',
        'import { bitunixWs } from "../../../services/bitunixWs";\n  import { PerformanceMonitor } from "../../../utils/performanceMonitor";'
    )

# 2. State vars
state_vars = """
  // FPS Throttling & Performance
  let performanceMonitor: PerformanceMonitor;
  let fpsInterval = 1000 / 30; // 30 FPS default
  let lastDrawTime = 0;
  let isHighPerformance = false;
  let highPerfTimeout: ReturnType<typeof setTimeout> | null = null;

  function onInteraction() {
      if (!isHighPerformance) {
          isHighPerformance = true;
          fpsInterval = 1000 / 60;
      }

      if (highPerfTimeout) clearTimeout(highPerfTimeout);
      highPerfTimeout = setTimeout(() => {
          isHighPerformance = false;
          fpsInterval = 1000 / 30;
      }, 1000);
  }
"""
if 'let performanceMonitor' not in content:
    content = content.replace(
        'let lifecycleError = <string | null>(null);',
        'let lifecycleError = <string | null>(null);\n' + state_vars
    )

# 3. initThree
content = content.replace(
    'resources.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });',
    'resources.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "default" });'
)

# 4. animate
new_animate = """
  function animate(time: number) {
    if (!resources.material || !resources.renderer || !resources.scene || !resources.camera) {
      return;
    }

    rafId = requestAnimationFrame(animate);

    // Throttling
    const now = performance.now();
    const elapsed = now - lastDrawTime;
    const targetInterval = isHighPerformance ? (1000 / 60) : (1000 / 30);

    if (elapsed > targetInterval) {
        lastDrawTime = now - (elapsed % targetInterval);

        // GPU TIME UPDATE
        resources.material.uniforms.uTime.value = now / 1000;

        // Raycasting Throttled
        if (now - lastRaycastTime > RAYCAST_THROTTLE_MS && mouse.x !== -1) {
          performOptimizedRaycast(now / 1000);
          lastRaycastTime = now;
        }

        resources.renderer.render(resources.scene, resources.camera);
        if (performanceMonitor) performanceMonitor.update();
    }
  }
"""

# Regex for animate. Matches until the closing brace after render call.
animate_regex = r"function animate\(time: number\) \{[\s\S]*?resources\.renderer\.render\(resources\.scene, resources\.camera\);\s*\}"
content = re.sub(animate_regex, new_animate.strip(), content)

# 5. onMount (Init Monitor) and onMouseMove (Interaction)
if 'performanceMonitor = new PerformanceMonitor' not in content:
    # Insert in onMount
    mount_add = """
        performanceMonitor = new PerformanceMonitor("TradeFlow");
        performanceMonitor.start(resources.renderer || undefined);
    """
    content = content.replace(
        'const result = initThree();',
        'const result = initThree();' + mount_add
    )

    # Cleanup
    cleanup_add = """
    if (performanceMonitor) performanceMonitor.stop();
    """
    content = content.replace(
        'log(LogLevel.INFO, \'✅ Cleanup complete\');',
        cleanup_add + 'log(LogLevel.INFO, \'✅ Cleanup complete\');'
    )

# 6. onMouseMove hook
content = content.replace(
    'function onMouseMove(event: MouseEvent) {',
    'function onMouseMove(event: MouseEvent) {\n    onInteraction();'
)

with open(file_path, 'w') as f:
    f.write(content)

print("TradeFlowBackground optimized.")
