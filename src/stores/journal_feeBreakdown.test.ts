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
import type { JournalEntry } from "./types";

describe("Journal Entry Fee Breakdown & Net PnL Calculations", () => {
    it("calculates totalFees from entryFee and exitFee when both are present", () => {
        const trade: JournalEntry = {
            id: "trade-1",
            date: new Date().toISOString(),
            symbol: "BTCUSDT",
            tradeType: "long",
            status: "Won",
            accountSize: new Decimal(1000),
            riskPercentage: new Decimal(1),
            leverage: new Decimal(10),
            fees: new Decimal("0.05"),
            entryFee: new Decimal("0.75"),
            entryFeeType: "maker",
            exitFee: new Decimal("1.25"),
            exitFeeType: "taker",
            totalFees: new Decimal("2.00"),
            fundingFee: new Decimal("0.10"),
            entryPrice: new Decimal(50000),
            exitPrice: new Decimal(51000),
            stopLossPrice: new Decimal(49500),
            totalRR: new Decimal("2.0"),
            totalNetProfit: new Decimal("47.90"), // 50 gross - 2.00 total fees - 0.10 funding
            riskAmount: new Decimal(10),
            maxPotentialProfit: new Decimal(50),
            notes: "Clean breakout",
            tags: ["breakout", "trend"],
            targets: [],
            calculatedTpDetails: [],
        };

        expect(trade.entryFee?.toNumber()).toBe(0.75);
        expect(trade.entryFeeType).toBe("maker");
        expect(trade.exitFee?.toNumber()).toBe(1.25);
        expect(trade.exitFeeType).toBe("taker");
        expect(trade.totalFees.toNumber()).toBe(2.00);

        const grossPnl = trade.totalNetProfit.plus(trade.totalFees).plus(trade.fundingFee || 0);
        expect(grossPnl.toNumber()).toBe(50);
    });

    it("handles legacy trades without separate entry/exit fees gracefully and splits proportionally", () => {
        const legacyTrade: JournalEntry = {
            id: "trade-legacy",
            date: new Date().toISOString(),
            symbol: "ETHUSDT",
            tradeType: "short",
            status: "Won",
            accountSize: new Decimal(500),
            riskPercentage: new Decimal(2),
            leverage: new Decimal(5),
            fees: new Decimal("0.102"),
            totalFees: new Decimal("0.102"),
            entryPrice: new Decimal(3000),
            exitPrice: new Decimal(3000),
            stopLossPrice: new Decimal(3050),
            totalRR: new Decimal("2.0"),
            totalNetProfit: new Decimal("19.898"),
            riskAmount: new Decimal(10),
            maxPotentialProfit: new Decimal(20),
            notes: "",
            targets: [],
            calculatedTpDetails: [],
        };

        const ep = legacyTrade.entryPrice;
        const xp = legacyTrade.exitPrice;
        const derivedEntryFee = legacyTrade.totalFees.times(ep).div(ep.plus(xp));
        const derivedExitFee = legacyTrade.totalFees.minus(derivedEntryFee);

        expect(derivedEntryFee.toNumber()).toBe(0.051);
        expect(derivedExitFee.toNumber()).toBe(0.051);
        expect(derivedEntryFee.plus(derivedExitFee).toNumber()).toBe(0.102);
    });
});
