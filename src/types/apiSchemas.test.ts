// @vitest-environment node
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
import {
  sanitizeErrorMessage,
  PositionRawSchema,
  BitunixTradingPairResponseSchema,
  BitunixPositionTierResponseSchema,
  BitunixLeverageMarginModeSchema,
} from './apiSchemas';

// Regression (BUG-0062): PositionRawSchema didn't declare positionId/
// positionMode, so Zod silently stripped both from a raw position object
// before it reached mapToOMSPosition — closePosition() then had no way to
// tell a HEDGE-mode account apart from ONE_WAY, or which position to
// target.
describe('PositionRawSchema', () => {
  it('preserves positionId and positionMode', () => {
    const result = PositionRawSchema.parse({
      symbol: 'XRPUSDT',
      qty: '9.1',
      positionId: '662491704776252252',
      positionMode: 'HEDGE',
    });
    expect(result.positionId).toBe('662491704776252252');
    expect(result.positionMode).toBe('HEDGE');
  });
});

// Response shapes documented in docs/bitunix-api/{02_account,04_market,05_position}.md
describe('BitunixTradingPairResponseSchema', () => {
  it('parses a real trading_pairs response', () => {
    const result = BitunixTradingPairResponseSchema.parse({
      code: 0,
      msg: 'Success',
      data: [{
        symbol: 'BTCUSDT', base: 'BTC', quote: 'USDT',
        minTradeVolume: '0.0001', maxLimitOrderVolume: '100000', maxMarketOrderVolume: '50000',
        basePrecision: 4, quotePrecision: 1,
        minLeverage: 1, maxLeverage: 125, defaultLeverage: 20,
        priceProtectScope: '0.02', symbolStatus: 'OPEN', isApiSupported: true,
      }],
    });
    expect(result.data?.[0].maxLeverage).toBe(125);
    expect(result.data?.[0].isApiSupported).toBe(true);
    expect(result.data?.[0].minTradeVolume?.toString()).toBe('0.0001');
  });
});

describe('BitunixPositionTierResponseSchema', () => {
  it('parses a real position_tiers response', () => {
    const result = BitunixPositionTierResponseSchema.parse({
      code: 0,
      msg: 'Success',
      data: [
        { symbol: 'BTCUSDT', level: 1, startValue: '0', endValue: '50000', leverage: 125, maintenanceMarginRate: '0.004' },
        { symbol: 'BTCUSDT', level: 2, startValue: '50000', endValue: '200000', leverage: 100, maintenanceMarginRate: '0.005' },
      ],
    });
    expect(result.data).toHaveLength(2);
    expect(result.data?.[1].maintenanceMarginRate?.toString()).toBe('0.005');
  });
});

describe('BitunixLeverageMarginModeSchema', () => {
  it('parses the flat shape our own proxy route returns', () => {
    const result = BitunixLeverageMarginModeSchema.parse({
      symbol: 'BTCUSDT', marginCoin: 'USDT', leverage: 10, marginMode: 'ISOLATION',
    });
    expect(result.leverage).toBe(10);
    expect(result.marginMode).toBe('ISOLATION');
  });
});

describe('sanitizeErrorMessage', () => {
  it('should redact simple key=value pairs', () => {
    const message = 'Error: apiKey=1234567890abcdef failed';
    const sanitized = sanitizeErrorMessage(message, 100);
    expect(sanitized).toBe('Error: apiKey=*** failed');
  });

  it('should redact key: value pairs', () => {
    const message = 'Error: apiSecret: secret_key_value failed';
    const sanitized = sanitizeErrorMessage(message, 100);
    expect(sanitized).toBe('Error: apiSecret: *** failed');
  });

  it('should redact JSON formatted strings', () => {
    const message = '{"error":"Something wrong","apiKey":"1234567890abcdef"}';
    const sanitized = sanitizeErrorMessage(message, 100);
    expect(sanitized).toBe('{"error":"Something wrong","apiKey":"***"}');
  });

  it('should redact JSON with spaces', () => {
    const message = '{ "apiKey" : "12345" }';
    const sanitized = sanitizeErrorMessage(message, 100);
    expect(sanitized).toBe('{ "apiKey" : "***" }');
  });

  it('should redact query parameters', () => {
    const message = 'QueryParams: ?apiKey=12345&secret=abcde';
    const sanitized = sanitizeErrorMessage(message, 100);
    expect(sanitized).toContain('apiKey=***');
    expect(sanitized).toContain('secret=***');
    expect(sanitized).not.toContain('12345');
    expect(sanitized).not.toContain('abcde');
  });

  it('should handle mixed quotes', () => {
    const message = "Mixed quotes: 'apiKey': \"12345\"";
    const sanitized = sanitizeErrorMessage(message, 100);
    expect(sanitized).toBe("Mixed quotes: 'apiKey': \"***\"");
  });

  it('should handle unquoted keys/values (if applicable)', () => {
    const message = 'No quotes: apiKey: 12345';
    const sanitized = sanitizeErrorMessage(message, 100);
    expect(sanitized).toBe('No quotes: apiKey: ***');
  });

  it('should handle other sensitive keys', () => {
    const keys = ['token', 'password', 'passphrase', 'api_key'];
    keys.forEach(key => {
      const msg = `${key}=secret123`;
      const sanitized = sanitizeErrorMessage(msg, 100);
      expect(sanitized).toBe(`${key}=***`);
    });
  });

  it('should limit length correctly', () => {
    const longMessage = 'A'.repeat(200);
    const sanitized = sanitizeErrorMessage(longMessage, 50);
    expect(sanitized.length).toBeLessThanOrEqual(53); // 50 + "..."
    expect(sanitized.endsWith('...')).toBe(true);
  });

  it('should not limit length if maxLength is 0', () => {
    const longMessage = 'A'.repeat(200);
    const sanitized = sanitizeErrorMessage(longMessage, 0);
    expect(sanitized.length).toBe(200);
    expect(sanitized.endsWith('...')).toBe(false);
  });

  it('should preserve non-sensitive parts', () => {
    const msg = 'User id=123, apiKey=secret';
    const sanitized = sanitizeErrorMessage(msg, 100);
    expect(sanitized).toContain('User id=123');
    expect(sanitized).toContain('apiKey=***');
  });


  // --- Edge Case Tests ---

  it('should handle empty strings', () => {
    expect(sanitizeErrorMessage('', 100)).toBe('');
  });

  it('should handle strings with no sensitive keys', () => {
    const msg = 'Error: something went wrong';
    expect(sanitizeErrorMessage(msg, 100)).toBe(msg);
  });

  it('should be case insensitive for keys', () => {
    const message = 'Error: APIKEY=12345, PassWord=abcde';
    const sanitized = sanitizeErrorMessage(message, 100);
    expect(sanitized).toBe('Error: APIKEY=***, PassWord=***');
  });

  it('should handle empty values', () => {
    const message = 'apiKey=""';
    expect(sanitizeErrorMessage(message, 100)).toBe('apiKey=""');
  });

  it('should not over-redact keys with suffixes', () => {
    const message = 'token_type=Bearer, token=12345';
    const sanitized = sanitizeErrorMessage(message, 100);
    expect(sanitized).toBe('token_type=Bearer, token=***');
  });

  it('should handle values with special characters (URL encoded, dashes, dots)', () => {
    const message = 'apiKey=abc-123.def%20ghi';
    const sanitized = sanitizeErrorMessage(message, 100);
    expect(sanitized).toBe('apiKey=***');
  });
});
