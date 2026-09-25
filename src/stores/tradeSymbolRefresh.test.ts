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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tradeState } from "./trade.svelte";

// Mock browser
vi.mock("$app/environment", () => ({
    browser: true,
    dev: true
}));

describe("BUG-0556: applySymbolRefresh preserves the stop strategy", () => {

    beforeEach(() => {
        tradeState.resetInputs(false, false);
    });

    afterEach(() => {
        tradeState.resetInputs(false, false);
    });

    it("keeps a manual stop untouched while adopting symbol and entry price", () => {
        tradeState.useAtrSl = false;
        tradeState.atrMode = "manual";
        tradeState.stopLossPrice = "60000";
        tradeState.atrValue = "45.5";
        tradeState.atrMultiplier = "2";

        const report = tradeState.applySymbolRefresh({
            symbol: "ETHUSDT",
            entryPrice: "3000",
        });

        expect(report.ok).toBe(true);
        expect(report.symbol).toBe("ETHUSDT");
        expect(tradeState.symbol).toBe("ETHUSDT");
        expect(tradeState.entryPrice).toBe("3000");
        expect(tradeState.useAtrSl).toBe(false);
        expect(tradeState.atrMode).toBe("manual");
        expect(tradeState.stopLossPrice).toBe("60000");
        expect(tradeState.atrValue).toBe("45.5");
        expect(tradeState.atrMultiplier).toBe("2");
        expect(report.preserved).toEqual(
            expect.arrayContaining([
                "useAtrSl",
                "atrMode",
                "stopLossPrice",
                "atrValue",
                "atrMultiplier",
            ]),
        );
        expect(report.cleared).toEqual([]);
    });

    it("keeps ATR-manual mode untouched on refresh", () => {
        tradeState.useAtrSl = true;
        tradeState.atrMode = "manual";
        tradeState.atrValue = "45.5";

        tradeState.applySymbolRefresh({ symbol: "SOLUSDT" });

        expect(tradeState.useAtrSl).toBe(true);
        expect(tradeState.atrMode).toBe("manual");
        expect(tradeState.atrValue).toBe("45.5");
    });

    it("keeps ATR-auto mode untouched on refresh", () => {
        tradeState.useAtrSl = true;
        tradeState.atrMode = "auto";
        tradeState.atrValue = "45.5";

        tradeState.applySymbolRefresh({ symbol: "SOLUSDT", entryPrice: "150" });

        expect(tradeState.useAtrSl).toBe(true);
        expect(tradeState.atrMode).toBe("auto");
        expect(tradeState.atrValue).toBe("45.5");
        expect(tradeState.entryPrice).toBe("150");
    });

    it("keeps the existing entry price when none is supplied", () => {
        tradeState.entryPrice = "67000";

        const report = tradeState.applySymbolRefresh({ symbol: "ETHUSDT" });

        expect(report.ok).toBe(true);
        expect(tradeState.symbol).toBe("ETHUSDT");
        expect(tradeState.entryPrice).toBe("67000");
    });

    it("keeps the existing entry price when an empty string is supplied", () => {
        tradeState.entryPrice = "67000";

        const report = tradeState.applySymbolRefresh({
            symbol: "ETHUSDT",
            entryPrice: "",
        });

        expect(report.ok).toBe(true);
        expect(tradeState.symbol).toBe("ETHUSDT");
        expect(tradeState.entryPrice).toBe("67000");
    });

    it("changes nothing and reports failure for an invalid symbol", () => {
        tradeState.useAtrSl = false;
        tradeState.atrMode = "manual";
        tradeState.stopLossPrice = "60000";
        tradeState.entryPrice = "67000";
        const beforeSymbol = tradeState.symbol;

        const report = tradeState.applySymbolRefresh({
            symbol: "",
            entryPrice: "1",
        });

        expect(report.ok).toBe(false);
        expect(report.reason).toBe("invalid-symbol");
        expect(tradeState.symbol).toBe(beforeSymbol);
        expect(tradeState.entryPrice).toBe("67000");
        expect(tradeState.useAtrSl).toBe(false);
        expect(tradeState.atrMode).toBe("manual");
        expect(tradeState.stopLossPrice).toBe("60000");
        expect(report.cleared).toEqual([]);
    });
});
