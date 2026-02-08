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

import { describe, it, expect } from 'vitest';
import { safeJsonParse } from '../../utils/safeJson';

describe('Server-Side Precision Loss Reproduction', () => {
    // A typical Bitunix Order ID (19 digits)
    // 1234567890123456789
    // In IEEE 754 double precision (JavaScript number), this becomes:
    // 1234567890123456800 (Loss of precision)
    const largeIdStr = "1234567890123456789";
    const jsonPayload = `{"id": ${largeIdStr}, "status": "FILLED"}`;

    it('should demonstrate that native JSON.parse corrupts 19-digit integers', () => {
        const parsed = JSON.parse(jsonPayload);

        // Expect corruption
        expect(parsed.id.toString()).not.toBe(largeIdStr);
        expect(parsed.id).toBe(1234567890123456800);

        console.log(`[Repro] Native Parse: ${largeIdStr} -> ${parsed.id}`);
    });

    it('should demonstrate that safeJsonParse preserves 19-digit integers as strings', () => {
        const parsed = safeJsonParse(jsonPayload);

        // Expect preservation
        expect(parsed.id).toBe(largeIdStr);
        expect(typeof parsed.id).toBe('string');

        console.log(`[Repro] Safe Parse:   ${largeIdStr} -> ${parsed.id}`);
    });

    it('should handle array contexts correctly (Bitunix/Bitget lists)', () => {
        const listPayload = `{"data": [${largeIdStr}, 123]}`;
        const native = JSON.parse(listPayload);
        const safe = safeJsonParse(listPayload);

        expect(native.data[0].toString()).not.toBe(largeIdStr); // Corrupted
        expect(safe.data[0]).toBe(largeIdStr); // Preserved
    });
});
