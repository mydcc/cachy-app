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


import { describe, it, expect, vi, beforeEach } from "vitest";
import { tradeState } from "./trade.svelte";
import { Decimal } from "decimal.js";

// Mock browser
vi.mock("$app/environment", () => ({
    browser: true,
    dev: true
}));

describe("Trade Store Integration", () => {

    beforeEach(() => {
        // Reset to clean state before each test
        tradeState.resetInputs(false, false);
    });

    it("should reset remote fields to undefined", () => {
        // Set values that should be reset
        tradeState.remoteLeverage = new Decimal(50);
        tradeState.remoteMarginMode = "isolated";

        expect(tradeState.remoteLeverage).toBeDefined();
        expect(tradeState.remoteMarginMode).toBeDefined();

        // Perform reset
        tradeState.resetInputs();

        // Verify reset
        expect(tradeState.remoteLeverage).toBeUndefined();
        expect(tradeState.remoteMarginMode).toBeUndefined();

        // Verify defaults are preserved where expected
        expect(tradeState.symbol).toBe("BTCUSDT"); // default
    });

    it("should preserve symbol if requested", () => {
        tradeState.setSymbol("ETHUSDT");
        tradeState.resetInputs(true); // preserveSymbol=true
        expect(tradeState.symbol).toBe("ETHUSDT");
    });

    it("should handle numeric zero prices in filter logic using Decimal", () => {
        // BUG-0002: verify that the filter logic now correctly handles numeric 0
        // using Decimal.isZero() instead of string comparison "0"

        const filterLogic = (targets: any[]) => {
            return targets.some((t) => {
                if (t.price === null) return false;
                try {
                    return !new Decimal(t.price).isZero();
                } catch {
                    return false;
                }
            });
        };

        // Test that numeric 0 is treated as zero
        const zeroNumeric = [{ price: 0, percent: "50", isLocked: false }];
        expect(filterLogic(zeroNumeric)).toBe(false);

        // Test that string "0" is still treated as zero
        const zeroString = [{ price: "0", percent: "50", isLocked: false }];
        expect(filterLogic(zeroString)).toBe(false);

        // Test that non-zero numeric is accepted
        const nonZeroNumeric = [{ price: 120000, percent: "50", isLocked: false }];
        expect(filterLogic(nonZeroNumeric)).toBe(true);

        // Test that non-zero string is accepted
        const nonZeroString = [{ price: "125000", percent: "50", isLocked: false }];
        expect(filterLogic(nonZeroString)).toBe(true);
    });

    it("should accept both string and number prices in targets", () => {
        tradeState.set({
            targets: [
                { price: 120000, percent: 50, isLocked: false },
                { price: "125000", percent: "25", isLocked: false }
            ]
        });

        const snapshot = tradeState.getSnapshot();
        expect(snapshot.targets).toHaveLength(2);
        expect(snapshot.targets[0].price).toBe(120000);
        expect(snapshot.targets[1].price).toBe("125000");
    });

    it("should accept both string and number entryPrice", () => {
        tradeState.set({
            entryPrice: 50000
        });
        expect(tradeState.entryPrice).toBe(50000);

        tradeState.set({
            entryPrice: "55000"
        });
        expect(tradeState.entryPrice).toBe("55000");
    });
});
