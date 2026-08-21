// @vitest-environment node
import { bench, describe } from 'vitest';
import { MarketManager, type MarketUpdatePayload } from '../../src/stores/market.svelte';

describe('MarketManager updateSymbol', () => {
  const market = new MarketManager();
  const SYMBOL = 'BTCUSDT';

  bench('updateSymbol (merge partial)', () => {
    for (let i = 0; i < 1000; i++) {
        market.updateSymbol(SYMBOL, {
            lastPrice: 50000 + i,
            markPrice: 50000 + i,
            indexPrice: undefined,
        });
    }
  });
});
