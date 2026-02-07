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
import { safeJsonParse } from '../utils/safeJson';

describe('safeJsonParse', () => {
    it('should parse normal JSON correctly', () => {
        const json = '{"a": 1, "b": "test"}';
        const parsed = safeJsonParse(json);
        expect(parsed).toEqual({ a: 1, b: "test" });
    });

    it('should parse large integers ending in Id as strings', () => {
        const json = '{"orderId": 1234567890123456789}';
        const parsed = safeJsonParse(json);
        expect(parsed.orderId).toBe("1234567890123456789");
    });

    it('should parse large integers in arbitrary keys as strings', () => {
        const bigIntStr = "1234567890123456789";
        const json = `{"timestamp": ${bigIntStr}, "nonce": ${bigIntStr}}`;

        const parsed = safeJsonParse(json);

        expect(parsed.timestamp).toBe(bigIntStr);
        expect(parsed.nonce).toBe(bigIntStr);
        expect(typeof parsed.timestamp).toBe("string");
    });

    it('should parse large integers in keys with escaped quotes', () => {
        const bigIntStr = "1234567890123456789";
        // JSON: {"key\"": 1234567890123456789}
        // In string literal we need to escape backslash for the quote
        const json = `{"key\\"": ${bigIntStr}}`;
        const parsed = safeJsonParse(json);
        expect(parsed['key"']).toBe(bigIntStr);
        expect(typeof parsed['key"']).toBe("string");
    });

    it('should not stringify small integers', () => {
        const json = '{"count": 123}';
        const parsed = safeJsonParse(json);
        expect(parsed.count).toBe(123);
        expect(typeof parsed.count).toBe("number");
    });

    it('should not double-quote already quoted strings', () => {
        const json = '{"id": "1234567890123456789"}';
        const parsed = safeJsonParse(json);
        expect(parsed.id).toBe("1234567890123456789");
    });

    it('should handle nested objects', () => {
        const bigIntStr = "9876543210987654321";
        const json = `{"data": {"value": ${bigIntStr}}}`;
        const parsed = safeJsonParse(json);
        expect(parsed.data.value).toBe(bigIntStr);
    });
});
