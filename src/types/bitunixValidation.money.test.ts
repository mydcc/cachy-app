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
 * BUG-0424: financial values crossing a Bitunix schema boundary must come out
 * as strings, never as native f64 numbers — same contract as BUG-0425
 * (`apiSchemas.money.test.ts`). A raw JSON number carries up to 0.5ulp of
 * parse error (unavoidable), but the schema must not widen that gap: it
 * normalizes to the shortest round-trip string so downstream `new Decimal()`
 * is exact, and string inputs pass through byte-identical. Timestamps
 * (`ctime`) never go through the money boundary and stay untouched.
 */

import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  BitunixTickerDataSchema,
  BitunixOrderSchema,
  BitunixPositionSchema,
} from './bitunixValidation';

// Classic f64 trap: 0.30000000000000004, not 0.3.
const F64_TRAP = 0.1 + 0.2;

function mustParse<T>(result: { success: boolean; data?: T; error?: unknown }): T {
  if (!result.success) throw new Error(`parse failed: ${JSON.stringify(result.error)}`);
  return result.data as T;
}

describe('BUG-0424 money boundary normalization', () => {
  it('BitunixTickerDataSchema emits strings for price/volume numbers', () => {
    const out = mustParse(BitunixTickerDataSchema.safeParse({
      la: F64_TRAP,
      o: 67432.187,
      h: 67500,
      l: 67300.5,
      b: 123.456,
      q: 789.012,
      r: 0.0123,
    }));
    for (const v of [out.la, out.o, out.h, out.l, out.b, out.q, out.r]) {
      expect(typeof v).toBe('string');
    }
    expect(out.la).toBe(String(F64_TRAP));
  });

  it('BitunixOrderSchema emits strings for price/qty/amount numbers', () => {
    const out = mustParse(BitunixOrderSchema.safeParse({
      orderId: '662491704776252252',
      symbol: 'BTCUSDT',
      orderStatus: 'open',
      price: 67455.321,
      qty: F64_TRAP,
      amount: 100.5,
      dealAmount: 50.25,
      ctime: 1720000000000,
    }));
    for (const v of [out.price, out.qty, out.amount, out.dealAmount]) {
      expect(typeof v).toBe('string');
    }
    expect(out.qty).toBe(String(F64_TRAP));
    // Timestamp is not money — it stays a raw number.
    expect(out.ctime).toBe(1720000000000);
  });

  it('BitunixPositionSchema emits strings for price/PnL/leverage numbers', () => {
    const out = mustParse(BitunixPositionSchema.safeParse({
      symbol: 'BTCUSDT',
      qty: F64_TRAP,
      size: 0.01,
      amount: 674.55321,
      averagePrice: 67455.321,
      avgOpenPrice: 67450.0,
      entryPrice: 67455.321,
      unrealizedPNL: -12.5,
      unrealizedPnl: -12.5,
      leverage: 10,
      liquidationPrice: 65000.0,
      liqPrice: 65000.0,
    }));
    for (const v of [
      out.qty, out.size, out.amount, out.averagePrice, out.avgOpenPrice,
      out.entryPrice, out.unrealizedPNL, out.unrealizedPnl, out.leverage,
      out.liquidationPrice, out.liqPrice,
    ]) {
      expect(typeof v).toBe('string');
    }
    expect(out.qty).toBe(String(F64_TRAP));
  });

  it('string inputs pass through byte-identical and stay Decimal-exact', () => {
    const out = mustParse(BitunixPositionSchema.safeParse({
      symbol: 'BTCUSDT',
      qty: '0.30000000000000004',
      entryPrice: '67455.321',
    }));
    expect(out.qty).toBe('0.30000000000000004');
    expect(out.entryPrice).toBe('67455.321');
    expect(new Decimal(out.qty as string).equals(new Decimal('0.30000000000000004'))).toBe(true);
  });
});
