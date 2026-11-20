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

/*
 * FEAT-0812 — a trade the trader entered by hand says so.
 *
 * FEAT-0806 left `origin` absent on history, which is the honest answer for
 * entries written before attribution existed. A record created *now* is a
 * different case: the manual-only filter asks for exactly these trades, and
 * the legacy note counts them as predating attribution (Devin review). The
 * boundary that creates them is the place that knows.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Decimal } from "decimal.js";

vi.mock("../stores/ui.svelte", () => ({
    uiState: {
        showError: vi.fn(),
        showFeedback: vi.fn(),
        update: vi.fn(),
        hideError: vi.fn(),
        setSyncProgress: vi.fn(),
    },
}));

vi.mock("./apiService", () => ({
    apiService: {
        fetchBitunixKlines: vi.fn(),
        fetchBitunixPrice: vi.fn(),
        fetchTicker24h: vi.fn(),
    },
}));

// Staleness has its own suite; here it must not decide the outcome.
vi.mock("../utils/tradeStaleness", () => ({
    describeStaleness: () => ({ stale: false }),
}));

import { app } from "./app";
import { tradeState } from "../stores/trade.svelte";
import { journalState } from "../stores/journal.svelte";
import { matchesOriginFilter } from "../lib/botTrackRecord";

beforeEach(() => {
    journalState.set([]);
    tradeState.currentTradeData = {
        tradeType: "long",
        status: "Open",
        symbol: "BTCUSDT",
        accountSize: new Decimal(10000),
        riskPercentage: new Decimal(1),
        entryPrice: new Decimal(100),
        leverage: new Decimal(1),
        fees: new Decimal(0),
        useAtrSl: false,
        atrValue: new Decimal(0),
        atrMultiplier: new Decimal(0),
        stopLossPrice: new Decimal(90),
        targets: [],
        totalPercentSold: new Decimal(0),
        positionSize: new Decimal(10),
        requiredMargin: new Decimal(1000),
        netLoss: new Decimal(100),
        breakEvenPrice: new Decimal(100),
        liquidationPrice: new Decimal(0),
        entryFee: new Decimal(0),
        riskAmount: new Decimal(100),
        totalNetProfit: new Decimal(0),
        totalRR: new Decimal(0),
        totalFees: new Decimal(0),
        maxPotentialProfit: new Decimal(0),
        calculatedTpDetails: [],
    };
});

describe("FEAT-0812 — app.addTrade stamps the manual origin", () => {
    it("records a hand-entered trade as manual, not as unattributed", async () => {
        await app.addTrade();

        const added = journalState.entries[0];
        expect(added).toBeDefined();
        expect(added.origin).toBe("manual");
    });

    it("lets the manual-only filter find what the trader just entered", async () => {
        await app.addTrade();

        expect(matchesOriginFilter(journalState.entries[0], "manual")).toBe(true);
    });
});
