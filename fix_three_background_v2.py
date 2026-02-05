import re

file_path = 'src/components/shared/ThreeBackground.svelte'

with open(file_path, 'r') as f:
    content = f.read()

# Fix controls type error by casting to any
content = content.replace(
    'if (controls) controls.enabled = false;',
    'if (controls) (controls as any).enabled = false;'
)
content = content.replace(
    'if (controls) controls.enabled = true;',
    'if (controls) (controls as any).enabled = true;'
)

with open(file_path, 'w') as f:
    f.write(content)

print("ThreeBackground fix v2 applied.")
