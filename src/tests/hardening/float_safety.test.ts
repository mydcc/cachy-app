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

import { describe, it, expect } from "vitest";
import { safeJsonParse } from "../../utils/safeJson";
import { marketState } from "../../stores/market.svelte";
import { Decimal } from "decimal.js";
import { get } from "svelte/store";

describe("Hardening: Float Safety & Data Integrity", () => {

    describe("safeJsonParse", () => {
        it("should parse normal small numbers as numbers", () => {
            const json = '{"a": 123, "b": 45.67}';
            const parsed = safeJsonParse(json);
            expect(parsed.a).toBe(123);
            expect(parsed.b).toBe(45.67);
            expect(typeof parsed.a).toBe("number");
        });

        it("should parse large integers as strings to preserve precision", () => {
            // Integer larger than Number.MAX_SAFE_INTEGER (2^53 - 1 approx 9e15)
            const hugeInt = "90071992547409999";
            const json = `{"id": ${hugeInt}}`;

            const parsed = safeJsonParse(json);
            expect(parsed.id).toBe(hugeInt);
            expect(typeof parsed.id).toBe("string");
        });

        it("should parse high-precision floats as strings", () => {
            const highPrecision = "0.1234567890123456789";
            const json = `{"val": ${highPrecision}}`;

            const parsed = safeJsonParse(json);
            expect(parsed.val).toBe(highPrecision);
            expect(typeof parsed.val).toBe("string");
        });

        it("should handle arrays of large numbers", () => {
            const json = '{"values": [123, 1234567890123456789]}';
            const parsed = safeJsonParse(json);
            expect(parsed.values[0]).toBe(123);
            expect(parsed.values[1]).toBe("1234567890123456789");
        });
    });

    describe("MarketState Float Handling", () => {
        it("should accept string inputs for Decimal fields", () => {
            const symbol = "BTCUSDT";
            const priceStr = "98765.12345678";

            marketState.updateSymbol(symbol, {
                lastPrice: priceStr as any // simulating safeJsonParse output
            });

            // Force flush
            (marketState as any).flushUpdates();

            const data = marketState.data[symbol];
            expect(data).toBeDefined();
            expect(data.lastPrice).toBeInstanceOf(Decimal);
            expect(data.lastPrice?.toString()).toBe(priceStr);
        });

        it("should accept number inputs but convert to Decimal (Legacy/Fallback support)", () => {
            const symbol = "ETHUSDT";
            const priceNum = 1234.56;

            marketState.updateSymbol(symbol, {
                lastPrice: priceNum
            });

            // Force flush
            (marketState as any).flushUpdates();

            const data = marketState.data[symbol];
            expect(data.lastPrice).toBeInstanceOf(Decimal);
            expect(data.lastPrice?.toNumber()).toBe(priceNum);
        });

        it("should handle mixed types in update", () => {
            const symbol = "SOLUSDT";

            marketState.updateSymbol(symbol, {
                lastPrice: "150.55", // String from safe parse
                volume: 500000 // Number from standard parse
            });

            // Force flush
            (marketState as any).flushUpdates();

            const data = marketState.data[symbol];
            expect(data.lastPrice?.toString()).toBe("150.55");
            expect(data.volume?.toNumber()).toBe(500000);
        });
    });
});
