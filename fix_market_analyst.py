import re

file_path = 'src/services/marketAnalyst.ts'

with open(file_path, 'r') as f:
    content = f.read()

# Replace duplicate const declaration
content = content.replace('        const isHidden = typeof document !== "undefined" && document.hidden;', '        // (isHidden already defined above)')

with open(file_path, 'w') as f:
    f.write(content)

print("Fixed duplicate declaration in marketAnalyst.ts")
