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

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import en from "../../../locales/locales/en.json";
import JournalTable from "./JournalTable.svelte";
import { Decimal } from "decimal.js";
import type { JournalEntry } from "../../../stores/types";

const dictionary = en as Record<string, unknown>;
function getNestedTranslation(path: string): string {
    const parts = path.split(".");
    let current: unknown = dictionary;
    for (const part of parts) {
        if (!current || typeof current !== "object") return path;
        current = (current as Record<string, unknown>)[part];
    }
    return typeof current === "string" ? current : path;
}

vi.mock("../../../locales/i18n", () => {
    const translate = (key: string) => getNestedTranslation(key);
    return {
        _: {
            subscribe: (fn: (val: typeof translate) => void) => {
                fn(translate);
                return () => {};
            },
        },
        locale: {
            subscribe: (fn: (val: string) => void) => {
                fn("en");
                return () => {};
            },
        },
    };
});

describe("FEAT-0251: JournalTable Component Tests", () => {
    let target: HTMLElement;
    let component: ReturnType<typeof mount> | null = null;

    beforeEach(() => {
        target = document.createElement("div");
        document.body.appendChild(target);
    });

    afterEach(() => {
        if (component) {
            unmount(component);
            component = null;
        }
        target.remove();
    });

    const mockTrade: JournalEntry = {
        id: "trade-101",
        date: "2026-08-22T10:00:00.000Z",
        symbol: "BTCUSDT",
        tradeType: "long",
        status: "Won",
        accountSize: new Decimal(1000),
        riskPercentage: new Decimal(1),
        leverage: new Decimal(10),
        fees: new Decimal("1.50"),
        entryFee: new Decimal("0.50"),
        entryFeeType: "maker",
        exitFee: new Decimal("1.00"),
        exitFeeType: "taker",
        totalFees: new Decimal("1.50"),
        fundingFee: new Decimal("0.05"),
        entryPrice: new Decimal(60000),
        exitPrice: new Decimal(61500),
        stopLossPrice: new Decimal(59500),
        totalRR: new Decimal("3.0"),
        totalNetProfit: new Decimal("98.45"),
        riskAmount: new Decimal(10),
        maxPotentialProfit: new Decimal(100),
        notes: "Test trade note",
        tags: ["momentum", "breakout"],
        targets: [],
        calculatedTpDetails: [],
    };

    it("renders sticky columns with appropriate CSS classes", () => {
        component = mount(JournalTable, {
            target,
            props: {
                trades: [mockTrade],
                currency: "USDT",
            },
        });
        flushSync();

        const dateHeader = target.querySelector("th.sticky-col.col-date");
        expect(dateHeader).not.toBeNull();

        const symbolHeader = target.querySelector("th.sticky-col.col-symbol");
        expect(symbolHeader).not.toBeNull();

        const pnlHeader = target.querySelector("th.sticky-col-right.col-pnl");
        expect(pnlHeader).not.toBeNull();
    });

    it("renders Maker and Taker fee badges in the table row", () => {
        component = mount(JournalTable, {
            target,
            props: {
                trades: [mockTrade],
                currency: "USDT",
            },
        });
        flushSync();

        const text = target.textContent || "";
        expect(text).toContain("BTCUSDT");
        expect(text).toContain("60000");
        expect(text).toContain("61500");
        expect(text).toContain("+98.45 USDT");
    });

    it("triggers onOpenTradeDetail when details button is clicked", () => {
        const onOpenDetail = vi.fn();
        component = mount(JournalTable, {
            target,
            props: {
                trades: [mockTrade],
                currency: "USDT",
                onOpenTradeDetail: onOpenDetail,
            },
        });
        flushSync();

        const detailBtn = target.querySelector("button[title=\"Trade Details\"]");
        expect(detailBtn).not.toBeNull();
        detailBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        flushSync();

        expect(onOpenDetail).toHaveBeenCalledWith(mockTrade);
    });
});
