import re

file_path = 'src/components/shared/backgrounds/TradeFlowBackground.svelte'

with open(file_path, 'r') as f:
    content = f.read()

# Replace type assertions
# (geom.attributes.position as THREE.BufferAttribute).updateRange
# to (geom.attributes.position as any).updateRange

content = content.replace('as THREE.BufferAttribute).updateRange', 'as any).updateRange')

with open(file_path, 'w') as f:
    f.write(content)

print("TradeFlow types fixed.")
