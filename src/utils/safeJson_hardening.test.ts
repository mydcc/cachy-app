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
import { safeJsonParse } from './safeJson';

describe('safeJsonParse Hardening', () => {
    // 19-digit number (Bitunix Order ID) - Standard JS loses precision here
    // 9223372036854775807 is MAX_SAFE_INTEGER (19 digits, but starts with 9)
    // Actually MAX_SAFE_INTEGER is 9007199254740991 (16 digits).
    // So 19 digits is DEFINITELY unsafe.
    const unsafeId = "1234567890123456789";

    // 20-digit number
    const hugeId = "12345678901234567890";

    it('should preserve 19-digit integers as strings', () => {
        const json = `{"id": ${unsafeId}}`;
        const parsed = safeJsonParse(json);
        expect(parsed.id).toBe(unsafeId);
        expect(typeof parsed.id).toBe('string');
    });

    it('should preserve 20-digit integers as strings', () => {
        const json = `{"longId": ${hugeId}}`;
        const parsed = safeJsonParse(json);
        expect(parsed.longId).toBe(hugeId);
        expect(typeof parsed.longId).toBe('string');
    });

    it('should preserve standard floats as numbers', () => {
        const json = `{"price": 123.456}`;
        const parsed = safeJsonParse(json);
        expect(parsed.price).toBe(123.456);
        expect(typeof parsed.price).toBe('number');
    });

    it('should handle nested objects with large integers', () => {
        const json = `{"data": {"orderId": ${unsafeId}}}`;
        const parsed = safeJsonParse(json);
        expect(parsed.data.orderId).toBe(unsafeId);
    });

    it('should handle arrays with large integers', () => {
        const json = `{"ids": [${unsafeId}, ${hugeId}]}`;
        const parsed = safeJsonParse(json);
        expect(parsed.ids[0]).toBe(unsafeId);
        expect(parsed.ids[1]).toBe(hugeId);
    });

    it('should handle mixed types in arrays', () => {
        const json = `{"mixed": [${unsafeId}, 123.45]}`;
        const parsed = safeJsonParse(json);
        expect(parsed.mixed[0]).toBe(unsafeId);
        expect(parsed.mixed[1]).toBe(123.45);
    });

    it('should not break on standard JSON', () => {
        const json = `{"name": "test", "val": 123}`;
        const parsed = safeJsonParse(json);
        expect(parsed.name).toBe("test");
        expect(parsed.val).toBe(123);
    });

    it('should handle Bitunix specific structure', () => {
        // Real Bitunix structure example
        const json = `{"code":0,"msg":"success","data":{"orderId":${unsafeId},"symbol":"BTCUSDT","price":65000.50}}`;
        const parsed = safeJsonParse(json);
        expect(parsed.data.orderId).toBe(unsafeId);
        expect(parsed.data.price).toBe(65000.50);
    });
});
