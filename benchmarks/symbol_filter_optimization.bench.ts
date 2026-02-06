import { bench, describe } from 'vitest';

describe('Symbol Filtering Optimization', () => {
  // Realistic scale based on typical crypto exchange symbol counts
  const TOTAL_SYMBOLS = 2500;
  const TOTAL_FAVORITES = 50;

  const symbols = Array.from({ length: TOTAL_SYMBOLS }, (_, i) => `BTCUSDT_${i}`);
  // Favorites are scattered throughout the list
  const favorites = Array.from({ length: TOTAL_FAVORITES }, (_, i) => `BTCUSDT_${i * 40}`);

  // Simulates the current implementation: O(N * M)
  bench('Current: Array.includes', () => {
    const favs = favorites;
    const result = symbols.filter((s) => favs.includes(s));
    if (result.length !== TOTAL_FAVORITES) throw new Error("Invalid filter result");
  });

  // Simulates the optimized implementation: O(N) + O(M) setup
  bench('Optimized: Set.has', () => {
    // We include the Set creation cost because inside the Svelte component's
    // $derived block, the Set would be recreated when dependencies change.
    const favs = new Set(favorites);
    const result = symbols.filter((s) => favs.has(s));
    if (result.length !== TOTAL_FAVORITES) throw new Error("Invalid filter result");
  });
});
