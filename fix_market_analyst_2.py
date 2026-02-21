import re

file_path = 'src/services/marketAnalyst.ts'

with open(file_path, 'r') as f:
    content = f.read()

# Restore the definition at the top
# Search for:
#         // [IDLE OPTIMIZATION]
#         // (isHidden already defined above)
#         // If hidden AND idle, we pause completely (5 min check)

pattern = r'// \[IDLE OPTIMIZATION\]\s+// \(isHidden already defined above\)\s+// If hidden AND idle'
replacement = '// [IDLE OPTIMIZATION]\n        const isHidden = typeof document !== "undefined" && document.hidden;\n        // If hidden AND idle'

content = re.sub(pattern, replacement, content)

with open(file_path, 'w') as f:
    f.write(content)

print("Restored isHidden declaration in marketAnalyst.ts")
