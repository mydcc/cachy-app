// @vitest-environment node
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

/**
 * BUG-0425: financial values crossing a schema boundary must come out as
 * strings, never as native f64 numbers. A raw JSON number has at most 0.5ulp
 * of parse error (unavoidable), but the schema must not widen that gap: it
 * normalizes to the shortest round-trip string so downstream `new Decimal()`
 * is exact, and string inputs pass through byte-identical.
 */

import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  PositionRawSchema,
  BitgetKlineSchema,
  TpSlRequestSchema,
} from './apiSchemas';
import { BitunixPriceDataSchema } from './bitunixValidation';
import { BitgetWSTickerSchema } from './bitgetValidation';

// Classic f64 trap: 0.30000000000000004, not 0.3.
const F64_TRAP = 0.1 + 0.2;

function mustParse<T>(result: { success: boolean; data?: T; error?: unknown }): T {
  if (!result.success) throw new Error(`parse failed: ${JSON.stringify(result.error)}`);
  return result.data as T;
}

describe('BUG-0425 money boundary normalization', () => {
  it('PositionRawSchema emits strings for qty/price/PnL numbers', () => {
    const out = mustParse(PositionRawSchema.safeParse({
      symbol: 'BTCUSDT',
      qty: F64_TRAP,
      entryPrice: 67455.321,
      unrealizedPNL: -12.5,
    }));
    expect(typeof out.qty).toBe('string');
    expect(typeof out.entryPrice).toBe('string');
    expect(typeof out.unrealizedPNL).toBe('string');
    expect(out.qty).toBe(String(F64_TRAP));
    expect(new Decimal(out.entryPrice as string).toNumber()).toBe(67455.321);
  });

  it('BitgetKlineSchema emits strings for OHLCV, timestamp untouched', () => {
    const out = mustParse(BitgetKlineSchema.safeParse(
      [1720000000000, '67432.187', 67500, 67300.5, F64_TRAP, 123.456],
    ));
    expect(out[0]).toBe(1720000000000);
    for (const v of out.slice(1)) expect(typeof v).toBe('string');
    expect(out[4]).toBe(String(F64_TRAP));
  });

  it('TpSlRequestSchema emits strings for price/qty numbers', () => {
    const out = mustParse(TpSlRequestSchema.safeParse({
      exchange: 'bitunix',
      action: 'place',
      params: { symbol: 'BTCUSDT', positionId: '662491704776252252', tpPrice: 67455.321, tpQty: 0.01 },
    }));
    if (out.action !== 'place') throw new Error('wrong action branch');
    expect(typeof out.params.tpPrice).toBe('string');
    expect(typeof out.params.tpQty).toBe('string');
  });

  it('BitunixPriceDataSchema emits strings for mark/index numbers', () => {
    const out = mustParse(BitunixPriceDataSchema.safeParse({ mp: 67455.321, ip: F64_TRAP }));
    expect(typeof out.mp).toBe('string');
    expect(typeof out.ip).toBe('string');
  });

  it('Bitget ticker fundingRate emits strings', () => {
    const ticker = mustParse(BitgetWSTickerSchema.safeParse({
      instId: 'BTCUSDT', last: '67455.321', fundingRate: 0.0001,
    }));
    expect(typeof ticker.fundingRate).toBe('string');
  });

  it('string inputs pass through byte-identical and stay Decimal-exact', () => {
    const out = mustParse(PositionRawSchema.safeParse({
      symbol: 'BTCUSDT',
      qty: '0.30000000000000004',
      entryPrice: '67455.321',
      positionId: '662491704776252252',
    }));
    expect(out.qty).toBe('0.30000000000000004');
    expect(out.entryPrice).toBe('67455.321');
    expect(out.positionId).toBe('662491704776252252');
    expect(new Decimal(out.qty as string).equals(new Decimal('0.30000000000000004'))).toBe(true);
  });
});
