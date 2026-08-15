## Svelte 5 Iteration Bottlenecks

### `{#each}` rendering loop constraints
Using array transformations like `.filter()` or `.map()` inline inside `{#each}` template blocks creates new array references on every component render/evaluation. This causes severe rendering overhead and defeats Svelte's fine-grained reactivity.

**Fix:**
- Always lift filtering logic into `$derived()` runes inside the script block.
- For iterating just to obtain an index (e.g., `array.map((_, i) => i)`), rely on Svelte's native `{#each array as item, index}` rather than fabricating intermediary arrays.
