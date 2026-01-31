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
import { safeJsonParse } from '../safeJson';

describe('Critical: JSON Precision Loss & Hardening', () => {
    // 1. Proof of Bug
    it('demonstrates that native JSON.parse destroys precision of 64-bit integers', () => {
        const rawId = "1234567890123456789";
        const jsonString = `{"orderId": ${rawId}}`;

        const parsed = JSON.parse(jsonString);
        expect(String(parsed.orderId)).not.toBe(rawId);
    });

    // 2. Verification of Fix
    it('verifies that safeJsonParse preserves large integers as strings', () => {
        const rawId = "1234567890123456789";
        const jsonString = `{"orderId": ${rawId}}`;

        const parsed = safeJsonParse(jsonString);

        console.log(`[Safe Parse] Raw ID:    ${rawId}`);
        console.log(`[Safe Parse] Parsed ID: ${parsed.orderId} (Type: ${typeof parsed.orderId})`);

        expect(parsed.orderId).toBe(rawId);
        expect(typeof parsed.orderId).toBe('string');
    });

    // 3. Regression Check for other types
    it('verifies that safeJsonParse handles normal data correctly', () => {
        const json = `{"id": 123, "name": "test", "val": 10.5}`;
        const parsed = safeJsonParse(json);
        expect(parsed.id).toBe(123); // Small int remains number (if < 15 digits)
        expect(parsed.name).toBe("test");
        expect(parsed.val).toBe(10.5);
    });
});
