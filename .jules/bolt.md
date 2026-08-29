## Svelte 5 Iteration Bottlenecks

### `{#each}` rendering loop constraints
Using array transformations like `.filter()` or `.map()` inline inside `{#each}` template blocks creates new array references on every component render/evaluation. This causes severe rendering overhead and defeats Svelte's fine-grained reactivity.

**Fix:**
- Always lift filtering logic into `$derived()` runes inside the script block.
- For iterating just to obtain an index (e.g., `array.map((_, i) => i)`), rely on Svelte's native `{#each array as item, index}` rather than fabricating intermediary arrays.
## Real-time WS Kline Ingestion

High-frequency WS streams often broadcast the same candlestick multiple times per second (updating only the high/low/close/volume) with the exact same timestamp. Blindly pushing these to a pending buffer array forces the downstream flush cycle to handle massive deduplication, causing memory and CPU spikes.
Checking `pending[pending.length - 1].time === k.time` and replacing the last element in-place transforms this from an O(N) sort/dedup operation into a near-zero cost O(1) assignment, drastically cutting the flush payload size without altering core behavior.

## Vitest Environment Overhead

Configuring `environment: "happy-dom"` globally causes happy-dom window/DOM context instantiation overhead for all tests, including pure logic/math unit tests. Annotating pure-logic test files with `// @vitest-environment node` and using lazy polyfills for IndexedDB in `vitest.setup.ts` reduced Vitest environment setup duration from 102.65s to 89.80s across the test suite.
## YYYY-MM-DD - Hoist template array mapping

**Learning:** Svelte 5 `$derived` prevents `O(N log N)` re-evaluations for complex operations inside `{#each}` blocks when unrelated variables trigger a tick.
**Action:** Extract operations like `array.slice(x).sort(...)` into a derived property when an interval triggers refresh loops inside the same component to prevent template layout thrashing.
