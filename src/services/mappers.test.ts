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
import { Decimal } from "decimal.js";
import { mapToOMSPosition, mapToOMSOrder } from "./mappers";

describe("Mappers", () => {
    describe("mapToOMSPosition", () => {
        it("should map valid position data correctly", () => {
            const raw = {
                symbol: "BTCUSDT",
                side: "buy", // 'buy' implies 'long' in some contexts, or 'long' explicitly
                amount: "1.5",
                entryPrice: "50000.50",
                unrealizedPNL: "100.20",
                leverage: "10",
                marginMode: "cross",
                liquidationPrice: "40000"
            };

            const result = mapToOMSPosition(raw);

            expect(result.symbol).toBe("BTCUSDT");
            expect(result.side).toBe("long");
            expect(result.amount).toBeInstanceOf(Decimal);
            expect(result.amount.toString()).toBe("1.5");
            expect(result.entryPrice.toString()).toBe("50000.5");
            expect(result.unrealizedPnl.toString()).toBe("100.2");
            expect(result.leverage.toString()).toBe("10");
            expect(result.marginMode).toBe("cross");
            expect(result.liquidationPrice?.toString()).toBe("40000");
        });

        it("should handle 'short' side variants", () => {
            const cases = ["short", "sell", "SELL", "SHORT"];
            cases.forEach(side => {
                const result = mapToOMSPosition({ symbol: "X", side });
                expect(result.side).toBe("short");
            });
        });

        it("should default missing numeric fields to 0", () => {
            const result = mapToOMSPosition({ symbol: "ETHUSDT" });
            expect(result.amount.toString()).toBe("0");
            expect(result.entryPrice.toString()).toBe("0");
            expect(result.unrealizedPnl.toString()).toBe("0");
        });

        it("should handle CLOSE event amount zeroing logic", () => {
             // If the event is explicitly 'CLOSE', amount should be 0 regardless of qty
             const raw = {
                 event: "CLOSE",
                 qty: "100"
             };
             const result = mapToOMSPosition(raw);
             expect(result.amount.toString()).toBe("0");
        });

        it("should prioritize avgOpenPrice over entryPrice", () => {
            const raw = {
                avgOpenPrice: "200",
                entryPrice: "100"
            };
            const result = mapToOMSPosition(raw);
            expect(result.entryPrice.toString()).toBe("200");
        });

        // Regression (BUG-0062): closePosition()/flashClosePosition() need
        // positionId/positionMode to close a HEDGE-mode position correctly.
        // Both are present on Bitunix's raw position payload but were
        // silently dropped before reaching OMSPosition.
        it("carries positionId through and normalizes positionMode to lowercase", () => {
            const result = mapToOMSPosition({
                symbol: "BTCUSDT",
                positionId: "662491704776252252",
                positionMode: "HEDGE",
            });
            expect(result.positionId).toBe("662491704776252252");
            expect(result.positionMode).toBe("hedge");
        });

        it("normalizes ONE_WAY to one_way", () => {
            const result = mapToOMSPosition({ symbol: "BTCUSDT", positionMode: "ONE_WAY" });
            expect(result.positionMode).toBe("one_way");
        });

        it("leaves positionId/positionMode undefined when absent", () => {
            const result = mapToOMSPosition({ symbol: "BTCUSDT" });
            expect(result.positionId).toBeUndefined();
            expect(result.positionMode).toBeUndefined();
        });
    });

    describe("mapToOMSOrder", () => {
        it("should map valid order data correctly", () => {
             const raw = {
                 orderId: "12345",
                 symbol: "BTCUSDT",
                 side: "BUY",
                 type: "LIMIT",
                 orderStatus: "FILLED",
                 price: "50000",
                 qty: "1",
                 dealAmount: "1",
                 ctime: 1600000000000
             };

             const result = mapToOMSOrder(raw);
             expect(result.id).toBe("12345");
             expect(result.side).toBe("buy");
             expect(result.status).toBe("filled");
             expect(result.price.toString()).toBe("50000");
             expect(result.amount.toString()).toBe("1");
             expect(result.filledAmount.toString()).toBe("1");
        });

        it("should convert numeric orderId to string safely", () => {
            const raw = { orderId: 12345 };
            const result = mapToOMSOrder(raw);
            expect(result.id).toBe("12345");
        });

        it("should handle missing numeric fields", () => {
            const result = mapToOMSOrder({});
            expect(result.price.toString()).toBe("0");
            expect(result.amount.toString()).toBe("0");
        });

        it("should not throw when a numeric field holds a non-numeric string", () => {
            // Regression: `new Decimal("MARKET")` throws (decimal.js does not
            // return NaN like Number() does), which used to crash the whole
            // reactive tree consuming OMS state when a raw WS/API field ended
            // up here malformed.
            const raw = {
                orderId: "1",
                symbol: "ETHUSDT",
                side: "BUY",
                type: "MARKET",
                price: "MARKET",
                qty: "MARKET",
                dealAmount: "MARKET",
            };

            const result = mapToOMSOrder(raw);
            expect(result.price.toString()).toBe("0");
            expect(result.amount.toString()).toBe("0");
            expect(result.filledAmount.toString()).toBe("0");
        });
    });
});
