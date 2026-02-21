import re

file_path = 'src/services/marketWatcher.ts'

with open(file_path, 'r') as f:
    content = f.read()

# 1. Add import
imports = 'import { idleMonitor } from "../utils/idleMonitor.svelte";\n'
content = content.replace('import { KlineRawSchema, type KlineRaw, type Kline } from "./technicalsTypes";', 'import { KlineRawSchema, type KlineRaw, type Kline } from "./technicalsTypes";\n' + imports)

# 2. Modify runPollingLoop
old_polling_loop_start = r'private async runPollingLoop\(\) \{'
new_polling_loop_start = """private async runPollingLoop() {
    if (!this.isPolling) return;

    // [IDLE OPTIMIZATION]
    // If hidden, run very slowly (10s)
    // If idle, run slowly (5s)
    // Normal: 1s
    let nextTick = 1000;

    if (typeof document !== 'undefined' && document.hidden) {
        nextTick = 10000;
    } else if (idleMonitor.isUserIdle) {
        nextTick = 5000;
    }

    try {"""

content = re.sub(old_polling_loop_start, new_polling_loop_start, content)

# Replace the timeout scheduling at the end of runPollingLoop
timeout_pattern = r'if \(this.isPolling\) \{\s+this.pollingTimeout = setTimeout\(\(\) => this.runPollingLoop\(\), 1000\);\s+\}'
new_timeout = """if (this.isPolling) {
      this.pollingTimeout = setTimeout(() => this.runPollingLoop(), nextTick);
    }"""
content = re.sub(timeout_pattern, new_timeout, content)

with open(file_path, 'w') as f:
    f.write(content)

print("Successfully modified marketWatcher.ts")
