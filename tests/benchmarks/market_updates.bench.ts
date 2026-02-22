/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */


import { bench, describe } from 'vitest';
import { MarketManager } from '../../src/stores/market.svelte';
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
