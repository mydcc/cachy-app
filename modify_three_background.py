import re

file_path = 'src/components/shared/ThreeBackground.svelte'

with open(file_path, 'r') as f:
    content = f.read()

# 1. Add Import
if 'import { PerformanceMonitor }' not in content:
    content = content.replace(
        'import { settingsState } from "../../stores/settings.svelte";',
        'import { settingsState } from "../../stores/settings.svelte";\n    import { PerformanceMonitor } from "../../utils/performanceMonitor";'
    )

# 2. Add State Variables
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
        'let resources: ThreeResources = {',
        state_vars + '\n    let resources: ThreeResources = {'
    )

# 3. Modify initThree renderer
content = content.replace(
    'resources.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });',
    'resources.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "default" });'
)

# 4. Modify onMount (Init Monitor + Event Listener)
if 'performanceMonitor = new PerformanceMonitor' not in content:
    on_mount_insertion = """
        performanceMonitor = new PerformanceMonitor("Galaxy3D");
        performanceMonitor.start(resources.renderer || undefined);
        window.addEventListener("mousemove", onInteraction);
"""
    content = content.replace(
        'const result = initThree();',
        'const result = initThree();' + on_mount_insertion
    )

    # Also remove event listener in cleanup
    cleanup_insertion = """
            if (performanceMonitor) performanceMonitor.stop();
            window.removeEventListener("mousemove", onInteraction);
"""
    content = content.replace(
        'window.removeEventListener("resize", onWindowResize);',
        'window.removeEventListener("resize", onWindowResize);' + cleanup_insertion
    )

# 5. Modify animate function
new_animate = """
    function animate() {
        if (!resources.renderer || !resources.scene || !resources.camera || !resources.galaxyMaterial) return;

        animationId = requestAnimationFrame(animate);

        // Throttling
        const now = performance.now();
        const elapsed = now - lastDrawTime;
        const targetInterval = isHighPerformance ? (1000 / 60) : (1000 / 30);

        if (elapsed > targetInterval) {
            lastDrawTime = now - (elapsed % targetInterval);

            // Use standard timing if needed, or simple increment
            resources.galaxyMaterial.uniforms.uTime.value += 0.01;

            if (resources.controls) {
                resources.controls.update();
            }

            resources.renderer.render(resources.scene, resources.camera);
            if (performanceMonitor) performanceMonitor.update();
        }
    }
"""

# Regex to replace existing animate function
# Assuming strict formatting based on previous cat output
animate_regex = r"function animate\(\) \{[\s\S]*?animationId = requestAnimationFrame\(animate\);\s*\}"
content = re.sub(animate_regex, new_animate.strip(), content)

with open(file_path, 'w') as f:
    f.write(content)

print("Modifications applied successfully.")
