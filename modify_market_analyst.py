import re

file_path = 'src/services/marketAnalyst.ts'

with open(file_path, 'r') as f:
    content = f.read()

# 1. Add import
imports = 'import { idleMonitor } from "../utils/idleMonitor.svelte";\n'
content = content.replace('import { toastService } from "./toastService.svelte";', 'import { toastService } from "./toastService.svelte";\n' + imports)

# 2. Add skip logic at start of processNext
start_pattern = r'private async processNext\(\) \{\s+if \(!this.isRunning\) return;'
new_start = """private async processNext() {
        if (!this.isRunning) return;

        // [IDLE OPTIMIZATION]
        const isHidden = typeof document !== "undefined" && document.hidden;
        // If hidden AND idle, we pause completely (5 min check)
        if (isHidden && idleMonitor.isUserIdle) {
            this.scheduleNext(300000);
            return;
        }"""

content = re.sub(start_pattern, new_start, content)

# 3. Modify scheduling logic at end
schedule_pattern = r'const anyNeedsUpdate = favoritesState\.items\.some\([\s\S]+?this\.scheduleNext\(delay\);'

schedule_replacement = """const anyNeedsUpdate = favoritesState.items.some(sym => {
                    const data = analysisState.results[sym];
                    return !data || !data.trends || data.trends["4h"] === "neutral";
                });

                const baseDelay = (settingsState.marketAnalysisInterval || 60) * 1000;

                let delay = baseDelay;

                if (anyNeedsUpdate) {
                    delay = 2000; // Fast fill
                } else if (isHidden) {
                    delay = baseDelay * 5; // Very slow if hidden
                } else if (idleMonitor.isUserIdle) {
                    delay = baseDelay * 2; // Slow if idle
                }

                // Hardening: Enforce minimum 2s
                delay = Math.max(delay, 2000);

                this.scheduleNext(delay);"""

content = re.sub(schedule_pattern, schedule_replacement, content)

with open(file_path, 'w') as f:
    f.write(content)

print("Successfully modified marketAnalyst.ts")
