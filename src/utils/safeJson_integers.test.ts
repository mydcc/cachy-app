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

import { describe, it, expect } from "vitest";
import { safeJsonParse } from "./safeJson";

describe("Safe JSON Parsing - Integers", () => {

    it("should handle MAX_SAFE_INTEGER correctly", () => {
        const input = `{"id": ${Number.MAX_SAFE_INTEGER}}`;
        const result = safeJsonParse(input);
        // Expect string because MAX_SAFE_INTEGER (16 digits) triggers the regex protection (15+ digits)
        expect(result.id).toBe(String(Number.MAX_SAFE_INTEGER));
    });

    it("should convert integers larger than MAX_SAFE_INTEGER to string", () => {
        const largeIntStr = "9007199254740993"; // MAX_SAFE + 2
        const input = `{"id": ${largeIntStr}}`;

        // This is the CRITICAL test.
        // If native JSON.parse runs, id becomes 9007199254740992 (precision loss).
        // If regex replacement works, it becomes "9007199254740993".

        const result = safeJsonParse(input);
        expect(result.id).toBe(largeIntStr);
        expect(typeof result.id).toBe("string");
    });

    it("should handle large negative integers", () => {
        const largeNegInt = "-9007199254740995";
        const input = `{"loss": ${largeNegInt}}`;

        const result = safeJsonParse(input);
        expect(result.loss).toBe(largeNegInt);
    });

    it("should handle multiple large integers in one object", () => {
        const id1 = "1234567890123456789";
        const id2 = "9876543210987654321";
        const input = `{"orderId": ${id1}, "clientId": ${id2}, "status": 1}`;

        const result = safeJsonParse(input);
        expect(result.orderId).toBe(id1);
        expect(result.clientId).toBe(id2);
        expect(result.status).toBe(1);
    });

    it("should not stringify standard floats or small integers", () => {
        const input = `{"price": 123.45, "qty": 100}`;
        const result = safeJsonParse(input);
        expect(result.price).toBe(123.45);
        expect(result.qty).toBe(100);
        expect(typeof result.price).toBe("number");
        expect(typeof result.qty).toBe("number");
    });
});
