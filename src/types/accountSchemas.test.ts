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

/**
 * BUG-0433: `AccountRequestSchema.params.leverage` is an integer that crosses
 * the schema boundary as a string, matching the money-boundary convention
 * (BUG-0424/0425). A raw JSON number is normalized to its shortest
 * round-trip string; a string passes through unchanged.
 */

import { describe, it, expect } from 'vitest';
import { AccountRequestSchema } from './accountSchemas';

describe('AccountRequestSchema leverage boundary (BUG-0433)', () => {
  it('normalizes a numeric leverage to its string form', () => {
    const out = AccountRequestSchema.parse({
      exchange: 'bitunix',
      params: { symbol: 'BTCUSDT', leverage: 20 },
    });
    expect(out.params?.leverage).toBe('20');
    expect(typeof out.params?.leverage).toBe('string');
  });

  it('passes a string leverage through unchanged', () => {
    const out = AccountRequestSchema.parse({
      exchange: 'bitunix',
      params: { symbol: 'BTCUSDT', leverage: '20' },
    });
    expect(out.params?.leverage).toBe('20');
    expect(typeof out.params?.leverage).toBe('string');
  });

  it('leaves leverage undefined when omitted', () => {
    const out = AccountRequestSchema.parse({
      exchange: 'bitunix',
      params: { symbol: 'BTCUSDT' },
    });
    expect(out.params?.leverage).toBeUndefined();
  });
});
