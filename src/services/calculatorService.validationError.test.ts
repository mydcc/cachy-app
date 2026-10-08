// @vitest-environment happy-dom
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
 * BUG-0650 — a validation message that is published and withdrawn in the same
 * call stack never reaches the trader.
 *
 * `handleValidationResult` called `showError(message)` and then `clearResults()`,
 * and `clearResults()` ends in `hideError()` when not guiding. Two writes to the
 * same pair of `$state`s inside one synchronous block: the framework batches
 * them, so the message is never painted. Not an empty message — a message that
 * exists for less time than a frame.
 *
 * The assertion is on *order*, not on absence. Both calls are still wanted:
 * clearing the stale figures is correct, and so is explaining why. Only their
 * sequence is wrong. A test that asserted `hideError` was never called would
 * have failed for the right reason and then pushed the fix towards deleting a
 * behaviour three other call sites rely on.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Decimal } from "decimal.js";
import { tradeState, INITIAL_TRADE_STATE } from "../stores/trade.svelte";
import { resultsState } from "../stores/results.svelte";
import { settingsState } from "../stores/settings.svelte";
import { marketState, type TradingPairInfo } from "../stores/market.svelte";
import { uiState } from "../stores/ui.svelte";
import { calculatorService } from "./calculatorService";
import { app } from "./app";

const fehler = vi.hoisted(() => ({ zeigen: vi.fn(), verbergen: vi.fn() }));

vi.mock("../stores/ui.svelte", () => ({
    uiState: {
        showError: fehler.zeigen,
        hideError: fehler.verbergen,
        showFeedback: vi.fn(),
        update: vi.fn(),
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

function seedTrade(over: Record<string, unknown> = {}) {
    const state = JSON.parse(JSON.stringify(INITIAL_TRADE_STATE));
    tradeState.set({
        ...state,
        symbol: "BTCUSDT",
        tradeType: "long",
        accountSize: "10000",
        riskPercentage: "1",
        entryPrice: "50000",
        stopLossPrice: "49500",
        leverage: "10",
        useAtrSl: false,
        isRiskAmountLocked: false,
        isPositionSizeLocked: false,
        targets: [],
        ...over,
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    marketState.reset();
    settingsState.apiProvider = "bitunix";
    seedTrade();
    marketState.setSymbolMeta("BTCUSDT", {
        symbol: "BTCUSDT",
        basePrecision: 4,
        quotePrecision: 2,
        minTradeVolume: new Decimal("0.0001"),
    } as Partial<TradingPairInfo> as TradingPairInfo);
});

afterEach(() => {
    settingsState.apiProvider = "bitunix";
    marketState.reset();
});

/** The message a trader was last shown, in the order they were shown it. */
function veroeffentlicht(): string[] {
    return fehler.zeigen.mock.calls.map((c) => String(c[0]));
}

describe("BUG-0650 — the validation reason has to outlive the clear that precedes it", () => {
    /*
     * The take-profit path, not the entry/stop one: `slBelowEntry` sits behind
     * the meta guards, and a crossed stop produces a nonsense size that trips a
     * guard first, so the INVALID branch is never reached. By the time a target
     * is validated the size is already computed and no guard stands in the way.
     */
    it("still shows the reason after clearing the figures it invalidated", () => {
        seedTrade({
            entryPrice: "50000",
            stopLossPrice: "49500",
            targets: [{ price: "49000", percent: "50", isLocked: false }],
        });

        app.calculateAndDisplay();

        const gezeigt = fehler.zeigen.mock.invocationCallOrder;
        const verbergen = fehler.verbergen.mock.invocationCallOrder;

        // Both must happen, and this is the assertion that had to come first.
        // An earlier version compared against `?? 0`, so "the clear never ran"
        // satisfied the ordering check vacuously - and the test was green before
        // the fix existed, on a path it never entered.
        expect(verbergen.length).toBeGreaterThan(0);
        expect(gezeigt.length).toBeGreaterThan(0);

        /*
         * The *last* thing that happens must be a show. Comparing the earliest
         * show with the latest hide was wrong: an earlier guard message would
         * fail the check even when the reason does survive to the end, which it
         * did - the assertion was rejecting a correct fix.
         */
        expect(
            Math.max(...gezeigt),
            "BUG-0650: the reason is published before the clear that hides it, so it never paints",
        ).toBeGreaterThan(Math.max(...verbergen));

        const nachrichten = veroeffentlicht();
        expect(
            nachrichten.some(
                (m) => m.length > 0 && m !== "dashboard.promptForData",
            ),
        ).toBe(true);
    });

    it("still guides on the incomplete path rather than explaining", () => {
        // Control: the sibling branch, which passes `true` and so shows.
        seedTrade({ entryPrice: "0" });

        app.calculateAndDisplay();

        expect(veroeffentlicht()).toContain("dashboard.promptForData");
    });

    it("still hides when clearResults is called to clear nothing else", () => {
        // The shared method is not changed by the fix, and three other call
        // sites depend on this behaviour.
        app.clearResults();

        expect(fehler.verbergen).toHaveBeenCalledTimes(1);
        expect(fehler.zeigen).not.toHaveBeenCalled();
    });
});
