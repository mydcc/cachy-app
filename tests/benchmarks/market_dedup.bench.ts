
import { bench, describe } from 'vitest';
import { MarketManager } from '../../src/stores/market.svelte';

describe('MarketManager Deduplication', () => {
  const market = new MarketManager();
  const SYMBOL = 'BTCUSDT';
  const TIMEFRAME = '1m';

  // Create a batch of 1000 updates for the SAME candle (simulating high-freq WS accumulation)
  // All have the same timestamp.
  const now = 1600000000000;
  const rawBatch: any[] = [];
  for (let i = 0; i < 1000; i++) {
      rawBatch.push({
          open: 50000,
          high: 51000 + (i * 0.1), // fluctuating high
          low: 49000,
          close: 50500 + (i * 0.1), // fluctuating close
          volume: 100 + i,
          time: now
      });
  }

  // Also create a multi-candle batch for comparison
  const multiBatch: any[] = [];
  for (let i = 0; i < 1000; i++) {
      multiBatch.push({
          open: 50000,
          high: 51000,
          low: 49000,
          close: 50500,
          volume: 100,
          time: now + (i * 60000)
      });
  }

  bench('applySymbolKlines (1000 updates, same candle)', () => {
      // We use 'rest' to bypass the internal buffer and force immediate execution of applySymbolKlines
      // This isolates the performance of the application logic (map -> sort -> dedup -> merge)
      market.updateSymbolKlines(SYMBOL, TIMEFRAME, rawBatch, 'rest', false);
  });

  bench('applySymbolKlines (1000 unique candles)', () => {
      market.updateSymbolKlines(SYMBOL, TIMEFRAME, multiBatch, 'rest', false);
  });
});
