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
import { safeJsonParse } from '../../src/utils/safeJson';

describe('safeJsonParse', () => {
    it('should parse normal JSON correctly', () => {
        const json = '{"key": "value", "num": 123}';
        const parsed = safeJsonParse(json);
        expect(parsed).toEqual({ key: 'value', num: 123 });
    });

    it('should protect large integers in object values', () => {
        // 19 digits - standard JS would lose precision
        const json = '{"id": 1234567890123456789}';
        const parsed = safeJsonParse(json);
        expect(parsed.id).toBe('1234567890123456789');
    });

    it('should protect large integers in arrays (e.g. Klines)', () => {
        // Standard Bitunix kline format often has timestamps as numbers
        // e.g. [1678901234567891234, "OPEN", ...]
        const json = '[1234567890123456789, "test"]';
        const parsed = safeJsonParse(json);
        expect(parsed[0]).toBe('1234567890123456789');
    });

    it('should protect CONSECUTIVE large integers in arrays', () => {
        // This fails if the regex consumes the trailing comma
        const json = '[1234567890123456789, 1234567890123456790]';
        const parsed = safeJsonParse(json);
        expect(parsed[0]).toBe('1234567890123456789');
        expect(parsed[1]).toBe('1234567890123456790');
    });

    it('should NOT treat floats as large integers', () => {
        const json = '{"val": 123456789012345.678}';
        const parsed = safeJsonParse(json);
        expect(parsed.val).toBe(123456789012345.678);
    });
});
