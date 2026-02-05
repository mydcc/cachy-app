import re

file_path = 'src/components/shared/ThreeBackground.svelte'

with open(file_path, 'r') as f:
    content = f.read()

content = content.replace(
    'resources.renderer.domElement = null;',
    '// resources.renderer.domElement = null;'
)

with open(file_path, 'w') as f:
    f.write(content)

print("ThreeBackground fix applied.")
