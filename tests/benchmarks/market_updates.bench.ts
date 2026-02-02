
import { bench, describe } from 'vitest';
import { MarketManager } from '../../src/stores/market.svelte.ts';
import { Decimal } from 'decimal.js';

describe('MarketManager Performance', () => {
  const market = new MarketManager();
  const SYMBOL = 'BTCUSDT';

  // Setup initial state using internal method to ensure history exists
  // We use REST mode to force immediate application
  market.updateSymbolKlines(SYMBOL, '1m', [{
    open: new Decimal(50000),
    high: new Decimal(51000),
    low: new Decimal(49000),
    close: new Decimal(50500),
    volume: new Decimal(100),
    time: 1600000000000
  }], 'rest');

  bench('updateKline (High Frequency - Buffered)', () => {
    // Simulate 100 updates to the same candle (typical live trading)
    // The updateKline method now internally uses 'ws' mode and buffers
    for (let i = 0; i < 100; i++) {
        market.updateKline(SYMBOL, '1m', {
            o: 50000,
            h: 51000 + i, // Changing high
            l: 49000,
            c: 50500 + i, // Changing close
            b: 100 + i,   // Volume (b)
            t: 1600000000000 // Same timestamp
        });
    }
  });

  bench('updateTicker (Buffered)', () => {
      for (let i = 0; i < 100; i++) {
          market.updateTicker(SYMBOL, {
              lastPrice: 50000 + i,
              vol: 1000 + i
          });
      }
  });
});
