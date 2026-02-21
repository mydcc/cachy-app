import re

file_path = 'src/services/activeTechnicalsManager.svelte.ts'

with open(file_path, 'r') as f:
    content = f.read()

# 1. Add import
imports = 'import { idleMonitor } from "../utils/idleMonitor.svelte";\n'
content = content.replace('import { BufferPool } from "../utils/bufferPool";', 'import { BufferPool } from "../utils/bufferPool";\n' + imports)

# 2. Modify Takt 1
takt1_pattern = r'if \(isActiveSymbol\) \{\s+// === TAKT 1: HIGH FREQUENCY \(Realtime\) ===[\s\S]+?delay = userInterval;\s+\}'
takt1_replacement = """if (isActiveSymbol) {
            // === TAKT 1: HIGH FREQUENCY (Realtime) ===
            const timeSinceSwitch = Date.now() - this.lastActiveSymbolChange;

            // [IDLE OPTIMIZATION]
            if (idleMonitor.isUserIdle) {
                delay = 1000; // Slow down to 1s if idle
            } else if (timeSinceSwitch < 200) {
                // Debounce: If switched < 200ms ago, impose small wait
                delay = 200;
            } else {
                // Use User Settings
                let userInterval = settingsState.technicalsUpdateInterval;
                if (!userInterval) {
                    const mode = settingsState.technicalsUpdateMode || 'balanced';
                    if (mode === 'realtime') userInterval = 100;
                    else if (mode === 'fast') userInterval = 250;
                    else if (mode === 'conservative') userInterval = 2000;
                    else userInterval = 500; // balanced
                }
                delay = userInterval;
            }
        }"""
content = re.sub(takt1_pattern, takt1_replacement, content)

# 3. Modify Takt 2
takt2_pattern = r'\} else if \(isVisible\) \{\s+// === TAKT 2: BACKGROUND / VISIBLE \(Dashboard\) ===[\s\S]+?delay = baseInterval \+ jitter;'
takt2_replacement = """} else if (isVisible) {
            // === TAKT 2: BACKGROUND / VISIBLE (Dashboard) ===
            const baseInterval = Math.max(5000, (settingsState.marketAnalysisInterval || 10) * 1000);
            const jitter = Math.floor(Math.random() * 500);

            if (idleMonitor.isUserIdle) {
                delay = baseInterval * 2; // Double interval if idle
            } else {
                delay = baseInterval + jitter;
            }"""
content = re.sub(takt2_pattern, takt2_replacement, content)

# 4. Modify Blur/Hidden
blur_pattern = r'// Global Throttle on Blur \(Sleep Mode\)[\s\S]+?delay = delay \* 3; // Aggressive throttling when window hidden\s+\}'
blur_replacement = """// Global Throttle on Blur (Sleep Mode)
        // If hidden (not just blurred), we might want to pause completely?
        // But Page Visibility API handles "hidden" via handleVisibilityChange -> pauseNonCriticalCalculations.
        // This check detects "blur" (window visible but not focused).
        if (settingsState.pauseAnalysisOnBlur && typeof document !== "undefined" && !document.hasFocus() && !isActiveSymbol) {
            delay = delay * 3;
        }

        // [IDLE + HIDDEN] Extreme Throttling
        if (typeof document !== 'undefined' && document.hidden) {
             delay = Math.max(delay, 10000); // Min 10s if hidden
        }"""
content = re.sub(blur_pattern, blur_replacement, content)

with open(file_path, 'w') as f:
    f.write(content)

print("Successfully modified activeTechnicalsManager.svelte.ts")
