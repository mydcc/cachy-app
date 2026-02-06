import json

with open('package.json', 'r') as f:
    data = json.load(f)

dev_deps = data.get('devDependencies', {})
deps = data.get('dependencies', {})

# List of packages to move
to_move = [
    "@sveltejs/adapter-node",
    "@sveltejs/kit",
    "@sveltejs/vite-plugin-svelte",
    "autoprefixer",
    "postcss",
    "svelte",
    "tailwindcss",
    "tsx",
    "typescript",
    "vite"
]

for pkg in to_move:
    if pkg in dev_deps:
        deps[pkg] = dev_deps[pkg]
        del dev_deps[pkg]

data['dependencies'] = deps
data['devDependencies'] = dev_deps

with open('package.json', 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n')
