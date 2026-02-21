import re

file_path = 'src/services/activeTechnicalsManager.svelte.ts'

with open(file_path, 'r') as f:
    content = f.read()

# Pattern: delay = userInterval; } } } else if (isVisible) {
# We want: delay = userInterval; } } else if (isVisible) {
# Because:
# } (close else inside takt1)
# } (close if isActiveSymbol)
# } (extra one)

# Regex to find the triple brace sequence
pattern = r'delay = userInterval;\s*\}\s*\}\s*\}\s*else if'
replacement = 'delay = userInterval;\n            }\n        } else if'

content = re.sub(pattern, replacement, content)

with open(file_path, 'w') as f:
    f.write(content)

print("Fixed activeTechnicalsManager.svelte.ts")
