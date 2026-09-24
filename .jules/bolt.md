## Svelte 5 Iteration Bottlenecks

### `{#each}` rendering loop constraints
Using array transformations like `.filter()` or `.map()` inline inside `{#each}` template blocks creates new array references on every component render/evaluation. This causes severe rendering overhead and defeats Svelte's fine-grained reactivity.

**Fix:**
- Always lift filtering logic into `$derived()` runes inside the script block.
- For iterating just to obtain an index (e.g., `array.map((_, i) => i)`), rely on Svelte's native `{#each array as item, index}` rather than fabricating intermediary arrays.

### `Array.slice()` in `{#each}` loops
Using `.slice()` inside a `{#each}` block (e.g. `{#each array.slice(0, 5) as item}`) similarly forces an array re-allocation on each reactivity update.

**Fix:**
- Hoist slicing logic into a derived variable (e.g. `let topItems = $derived(array.slice(0, 5));`) to maintain stable references.

## Real-time WS Kline Ingestion

High-frequency WS streams often broadcast the same candlestick multiple times per second (updating only the high/low/close/volume) with the exact same timestamp. Blindly pushing these to a pending buffer array forces the downstream flush cycle to handle massive deduplication, causing memory and CPU spikes.
Checking `pending[pending.length - 1].time === k.time` and replacing the last element in-place transforms this from an O(N) sort/dedup operation into a near-zero cost O(1) assignment, drastically cutting the flush payload size without altering core behavior.

## Vitest Environment Overhead

Configuring `environment: "happy-dom"` globally causes happy-dom window/DOM context instantiation overhead for all tests, including pure logic/math unit tests. Annotating pure-logic test files with `// @vitest-environment node` and using lazy polyfills for IndexedDB in `vitest.setup.ts` reduced Vitest environment setup duration from 102.65s to 89.80s across the test suite.

## $(date +%Y-%m-%d) - Svelte 5 derived filtering and sorting optimization
**Learning:** When sorting a `$derived` array in Svelte 5 based on parsed strings (like `priceChangePercent` or `quoteVolume` from `snapshot`), extracting the `Number()` conversions into a separate pre-calculated block for *all* elements can be slower because it forces parsing for items that are filtered out. Instead, perform the filtering first, and *then* build a small lookup dictionary (Schwartzian transform) containing the `Number()`-parsed values only for the elements that survived the filter. This prevents $O(N \log N)$ repeated `Number()` parsing inside the `.sort()` comparator, while maintaining $O(N)$ string-to-number parse efficiency. Also remember to hoist `toLowerCase()` outside of loop bodies.
**Action:** Applied this transform in `src/lib/windows/implementations/SymbolPickerView.svelte`, which yielded a 4.8x performance gain in the benchmark for 1000 pairs.
