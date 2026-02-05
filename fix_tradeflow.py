import re

file_path = 'src/components/shared/backgrounds/TradeFlowBackground.svelte'

with open(file_path, 'r') as f:
    content = f.read()

state_vars = """
  // FPS Throttling & Performance
  let performanceMonitor: PerformanceMonitor;
  let fpsInterval = 1000 / 30; // 30 FPS default
  let lastDrawTime = 0;
  let isHighPerformance = false;
  let highPerfTimeout: ReturnType<typeof setTimeout> | null = null;

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
    target = 'let lifecycleError = <string | null>(null);'
    idx = content.find(target)
    if idx != -1:
        insert_idx = idx + len(target)
        content = content[:insert_idx] + '\n' + state_vars + content[insert_idx:]
    else:
        print("Error: Could not find insertion point for state vars")

with open(file_path, 'w') as f:
    f.write(content)

print("TradeFlowBackground fix applied.")
