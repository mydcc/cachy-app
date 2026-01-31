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
import { tradeState, INITIAL_TRADE_STATE } from "./trade.svelte";
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
});
