import re

files = [
    'src/components/shared/ThreeBackground.svelte',
    'src/components/shared/backgrounds/TradeFlowBackground.svelte'
]

for file_path in files:
    with open(file_path, 'r') as f:
        content = f.read()

    # Remove lines containing forceContextLoss
    lines = content.split('\n')
    new_lines = [line for line in lines if 'forceContextLoss' not in line]
    content = '\n'.join(new_lines)

    with open(file_path, 'w') as f:
        f.write(content)

print("Removed forceContextLoss calls.")
