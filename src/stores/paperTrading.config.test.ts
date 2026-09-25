// @vitest-environment happy-dom
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

/*
 * BUG-0552 — paper config ranges must not break fill quantity/price invariants.
 *
 * Covers both boundaries: `setConfig` persistence validation and direct
 * simulator calls with a stale (pre-fix) persisted config.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Decimal } from "decimal.js";

vi.mock("$app/environment", () => ({ browser: true, dev: true }));

import { paperState } from "./paperTrading.svelte";
import { paperExchange, setPaperPriceFeed } from "../services/paperExchange";
import { CONSTANTS } from "../lib/constants";

const PRICE = new Decimal(50000);

beforeEach(() => {
    localStorage.clear();
    paperState.reloadFromStorage();
    paperState.resetBook();
    paperState.setConfig("failureMode", "none");
    paperState.setConfig("slippageBps", "0");
    paperState.setConfig("takerFeeBps", "0");
    paperState.setConfig("startingBalance", "10000");
    paperState.setConfig("partialFillRatio", "0.5");
    paperState.resetBook();
    setPaperPriceFeed((symbol) => (symbol === "BTCUSDT" ? PRICE : null));
});

function place(
    qty: string,
    extra: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
    return paperExchange.handle("/api/orders", {
        type: "place-order",
        symbol: "BTCUSDT",
        side: "BUY",
        orderType: "MARKET",
        qty,
        leverage: "10",
        ...extra,
    });
}

function dataOf(result: Record<string, unknown>): Record<string, unknown> {
    return result.data as Record<string, unknown>;
}

/**
 * Writes a config value the way a pre-fix client could have persisted it:
 * straight into storage, bypassing `setConfig` validation.
 */
function injectStaleConfig(patch: Record<string, string>): void {
    const raw = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_PAPER_KEY);
    expect(raw).not.toBeNull();
    const blob = JSON.parse(raw as string) as {
        config: Record<string, string>;
    };
    blob.config = { ...blob.config, ...patch };
    localStorage.setItem(
        CONSTANTS.LOCAL_STORAGE_PAPER_KEY,
        JSON.stringify(blob),
    );
    paperState.reloadFromStorage();
}

describe("BUG-0552 — setConfig persistence boundary", () => {
    it("rejects a partialFillRatio above one and keeps the old value", () => {
        expect(paperState.setConfig("partialFillRatio", "1.5")).toBe(false);
        expect(paperState.config.partialFillRatio).toBe("0.5");
    });

    it("accepts the ratio edges zero and one", () => {
        expect(paperState.setConfig("partialFillRatio", "0")).toBe(true);
        expect(paperState.setConfig("partialFillRatio", "1")).toBe(true);
    });

    it("rejects slippage at or above 100 % (10000 bps)", () => {
        expect(paperState.setConfig("slippageBps", "10000")).toBe(false);
        expect(paperState.setConfig("slippageBps", "25000")).toBe(false);
        expect(paperState.config.slippageBps).toBe("0");
    });

    it("accepts slippage just below 100 %", () => {
        expect(paperState.setConfig("slippageBps", "9999")).toBe(true);
    });

    it("rejects negative slippage", () => {
        expect(paperState.setConfig("slippageBps", "-1")).toBe(false);
    });

    it("preserves fee validation (FEAT-0328): generic non-negative check, no upper bound", () => {
        expect(paperState.setConfig("takerFeeBps", "6")).toBe(true);
        expect(paperState.setConfig("makerFeeBps", "2")).toBe(true);
        expect(paperState.setConfig("takerFeeBps", "-1")).toBe(false);
        // Fees are intentionally not capped here — fee ranges belong to FEAT-0328.
        expect(paperState.setConfig("takerFeeBps", "500")).toBe(true);
    });
});

describe("BUG-0552 — simulator calculation boundary", () => {
    it("ratio zero fills nothing: no position, no fee, never the full request", async () => {
        paperState.setConfig("failureMode", "partial");
        paperState.setConfig("partialFillRatio", "0");
        paperState.setConfig("takerFeeBps", "10");

        const result = dataOf(await place("1"));

        expect(result.qty).toBe("0");
        expect(result.partial).toBe(true);
        expect(paperState.positions).toHaveLength(0);
        expect(paperState.fills).toHaveLength(0);
        expect(paperState.balance.eq(10000)).toBe(true);
    });

    it("a zero fill on the close path leaves the position and balance untouched", async () => {
        await place("1");
        expect(paperState.positions).toHaveLength(1);

        paperState.setConfig("failureMode", "partial");
        paperState.setConfig("partialFillRatio", "0");
        const before = paperState.balance.toString();

        const result = dataOf(
            await place("1", { tradeSide: "CLOSE", reduceOnly: true }),
        );

        expect(result.qty).toBe("0");
        expect(paperState.positions).toHaveLength(1);
        expect(paperState.positions[0].amount).toBe("1");
        expect(paperState.balance.toString()).toBe(before);
    });

    it("a stale ratio above one never overfills", async () => {
        paperState.setConfig("failureMode", "partial");
        injectStaleConfig({ partialFillRatio: "2" });

        const result = dataOf(await place("1"));

        expect(new Decimal(String(result.qty)).lte(1)).toBe(true);
        expect(paperState.positions).toHaveLength(1);
        expect(paperState.positions[0].amount).toBe("1");
    });

    it("stale slippage of 100 % on a SELL still fills at a positive price", async () => {
        injectStaleConfig({ slippageBps: "10000" });

        await paperExchange.handle("/api/orders", {
            type: "place-order",
            symbol: "BTCUSDT",
            side: "SELL",
            orderType: "MARKET",
            qty: "1",
            leverage: "10",
        });

        const entry = new Decimal(paperState.positions[0].entryPrice);
        expect(entry.gt(0)).toBe(true);
    });

    it("extreme stale slippage keeps BUY and SELL fill prices positive", async () => {
        injectStaleConfig({ slippageBps: "20000" }); // 200 %

        await place("1", { side: "BUY" });
        expect(new Decimal(paperState.positions[0].entryPrice).gt(0)).toBe(
            true,
        );

        paperState.resetBook();
        await place("1", { side: "SELL" });
        expect(new Decimal(paperState.positions[0].entryPrice).gt(0)).toBe(
            true,
        );
    });

    it("a normal partial ratio still partially fills", async () => {
        paperState.setConfig("failureMode", "partial");
        paperState.setConfig("partialFillRatio", "0.5");

        const result = dataOf(await place("1"));

        expect(result.qty).toBe("0.5");
        expect(result.partial).toBe(true);
        expect(paperState.positions[0].amount).toBe("0.5");
    });
});
