💡 What
- Hoists the `.slice(0, 5)` operation inside `NewsSentimentPanel.svelte` templates into a `$derived` rune within the script block.

🎯 Why
- Using array transformations like `.slice()` inline inside `{#each}` template blocks creates new array references on every Svelte render cycle, defeating fine-grained reactivity and causing severe rendering overhead.

📊 Impact
- **Unmeasured but reasoned:** Avoids multiple O(n) array allocations per frame or component update when `news` or unrelated state updates. It guarantees Svelte tracks the iteration over a stable reference.

✅ Verification
- Passed `npm run check`.
- Passed `npm run lint`.
- Passed `npm test` successfully.

⚠️ Review notes
- Replaced `{#each news.slice(0, 5) as item}` with `{#each topNews as item}` across all template variants. Behavior remains perfectly identical.
