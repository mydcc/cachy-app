/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, it, expect } from 'vitest';
import { mdaService } from './mdaService';

describe('mdaService Data Hardening', () => {
  it('should normalize numeric inputs to strings for Bitunix', () => {
    // Simulate what happens when JSON.parse creates numbers
    const raw = {
      symbol: 'BTCUSDT',
      data: {
        lastPrice: 50000.50, // Number
        highPrice: 51000,
        lowPrice: 49000,
        volume: 1000.123
      }
    };

    const normalized = mdaService.normalizeTicker(raw, 'bitunix');

    // Assert strict string type
    expect(typeof normalized.lastPrice).toBe('string');
    expect(normalized.lastPrice).toBe('50000.5'); // JS default stringification
    expect(typeof normalized.volume).toBe('string');
    expect(normalized.volume).toBe('1000.123');
  });

  it('should handle string inputs correctly (preserving precision)', () => {
    const raw = {
      symbol: 'BTCUSDT',
      data: {
        lastPrice: "50000.500000001", // High precision string
        volume: "1000.123"
      }
    };
    const normalized = mdaService.normalizeTicker(raw, 'bitunix');

    expect(typeof normalized.lastPrice).toBe('string');
    expect(normalized.lastPrice).toBe('50000.500000001'); // Should not round
  });

  it('should handle null/undefined safely', () => {
     const raw = { symbol: 'BTCUSDT', data: {} };
     const normalized = mdaService.normalizeTicker(raw, 'bitunix');
     // Changed behavior: Invalid/Empty data returns null to prevent zero-price pollution
     expect(normalized).toBeNull();
  });

  it('should handle fast-path flat objects', () => {
      // Bitunix fast path might pass flat object
      const raw = {
          symbol: 'ETHUSDT',
          lp: 3000.55 // Number alias
      };

      const normalized = mdaService.normalizeTicker(raw, 'bitunix');
      expect(normalized.lastPrice).toBe('3000.55');
      expect(typeof normalized.lastPrice).toBe('string');
  });
});
