// @vitest-environment jsdom
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

/**
 * FEAT-0812 — the per-bot cards, as the trader sees them.
 *
 * The records arrive from `botTrackRecords` rather than hand-built literals,
 * so these tests exercise the seam the app actually runs: journal entries in,
 * rendered card out. A card that renders correct-looking numbers from a
 * fixture nobody produces proves nothing about the feature.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { Decimal } from "decimal.js";

import JournalBotCards from "./JournalBotCards.svelte";
import {
    botTrackRecords,
    unattributedClosedCount,
} from "../../../lib/botTrackRecord";
import type { JournalEntry } from "../../../stores/types";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

interface EntryOverrides {
    status?: JournalEntry["status"];
    origin?: "bot" | "manual";
    botId?: string;
    strategyHash?: string;
    exitOrigin?: "bot" | "manual";
    netProfit?: string;
    rr?: string;
    exitDate?: string;
}

let seq = 0;

function entry(overrides: EntryOverrides = {}): JournalEntry {
    seq += 1;
    return {
        id: `e-${seq}`,
        date: "2026-01-01T00:00:00.000Z",
        entryDate: "2026-01-01T00:00:00.000Z",
        exitDate: overrides.exitDate,
        symbol: "BTCUSDT",
        tradeType: "long",
        status: overrides.status ?? "Won",
        accountSize: new Decimal(10000),
        riskPercentage: new Decimal(1),
        leverage: new Decimal(1),
        fees: new Decimal(0),
        entryPrice: new Decimal(100),
        stopLossPrice: new Decimal(90),
        totalRR: new Decimal(overrides.rr ?? "0"),
        totalNetProfit: new Decimal(overrides.netProfit ?? "0"),
        riskAmount: new Decimal(100),
        totalFees: new Decimal(0),
        maxPotentialProfit: new Decimal(0),
        notes: "",
        targets: [],
        calculatedTpDetails: [],
        isPaper: true,
        origin: overrides.origin,
        botId: overrides.botId,
        ruleId: overrides.botId,
        strategyHash: overrides.strategyHash,
        exitOrigin: overrides.exitOrigin,
    };
}

function botTrade(overrides: EntryOverrides = {}): JournalEntry {
    return entry({
        origin: "bot",
        botId: "bot-1",
        strategyHash: HASH_A,
        exitOrigin: "bot",
        exitDate: "2026-01-01T06:00:00.000Z",
        ...overrides,
    });
}

let host: HTMLElement;
let component: ReturnType<typeof mount> | null = null;

interface RenderOptions {
    botNames?: Map<string, string | null>;
    selectedBotId?: string;
    onselect?: (botId: string) => void;
}

function render(entries: JournalEntry[], options: RenderOptions = {}) {
    component = mount(JournalBotCards, {
        target: host,
        props: {
            records: botTrackRecords(entries),
            botNames: options.botNames ?? new Map(),
            unattributedCount: unattributedClosedCount(entries),
            selectedBotId: options.selectedBotId ?? "",
            onselect: options.onselect,
        },
    });
    flushSync();
    return host;
}

function at(testId: string): HTMLElement | null {
    return host.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
}

function textAt(testId: string): string {
    const node = at(testId);
    if (node === null) throw new Error(`no element with data-testid="${testId}"`);
    return (node.textContent ?? "").replace(/\s+/g, " ").trim();
}

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host.remove();
});

describe("FEAT-0812 — JournalBotCards", () => {
    it("explains the empty state instead of rendering a card with zeroes", () => {
        render([entry({ origin: "manual", netProfit: "10" })]);

        expect(at("bot-cards-empty")).not.toBeNull();
        expect(at("bot-card-bot-1")).toBeNull();
        // The explanation is a sentence, not a raw translation key.
        expect(textAt("bot-cards-empty")).not.toMatch(/^journal\./);
        expect(textAt("bot-cards-empty").length).toBeGreaterThan(10);
    });

    it("shows a bot's figures and keeps a manual exit in its own row", () => {
        // Two bot exits (+200 won, -100 lost) and one position the trader
        // closed by hand for -500. The headline figures must describe the
        // bot's own exits only.
        render([
            botTrade({ netProfit: "200", rr: "2", status: "Won" }),
            botTrade({
                netProfit: "-100",
                rr: "-1",
                status: "Lost",
                exitDate: "2026-01-02T06:00:00.000Z",
            }),
            botTrade({
                netProfit: "-500",
                status: "Lost",
                exitOrigin: "manual",
                exitDate: "2026-01-03T06:00:00.000Z",
            }),
        ]);

        expect(at("bot-card-bot-1")).not.toBeNull();
        expect(textAt("metric-trades")).toBe("2");
        expect(textAt("metric-win-rate")).toBe("50.0%");
        expect(textAt("metric-avg-r")).toBe("0.50R");
        expect(textAt("metric-total-pnl")).toBe("100.00");
        expect(textAt("metric-max-drawdown")).toBe("100.00");

        // The manual exit is counted and named, and its -500 never reached
        // the total above.
        const manualRow = textAt("manual-exit-row");
        expect(manualRow).toContain("1");
        expect(manualRow).toContain("-500.00");
    });

    it("renders no manual-exit row for a bot every exit of which was its own", () => {
        render([botTrade({ netProfit: "40" })]);

        expect(at("manual-exit-row")).toBeNull();
    });

    it("leaves a legacy unattributed trade out of the cards and says how many there are", () => {
        render([
            botTrade({ netProfit: "50" }),
            // Written before a trade recorded who opened it.
            entry({ status: "Won", netProfit: "999", exitDate: "2026-02-01T00:00:00.000Z" }),
            entry({ status: "Lost", netProfit: "-7", exitDate: "2026-02-02T00:00:00.000Z" }),
        ]);

        expect(textAt("metric-trades")).toBe("1");
        expect(textAt("metric-total-pnl")).toBe("50.00");
        expect(textAt("unattributed-note")).toContain("2");
    });

    it("says nothing about unattributed trades when there are none", () => {
        render([botTrade({ netProfit: "10" })]);

        expect(at("unattributed-note")).toBeNull();
    });

    it("counts a still-open bot trade in its own row, not in the closed figures", () => {
        render([
            botTrade({ netProfit: "20" }),
            botTrade({ status: "Open", exitDate: undefined }),
        ]);

        expect(textAt("metric-trades")).toBe("1");
        expect(textAt("open-trades-row")).toContain("1");
    });

    it("labels a record whose rule was deleted, and still shows its figures", () => {
        render([botTrade({ botId: "bot-gone", netProfit: "15" })], {
            botNames: new Map([["bot-gone", null]]),
        });

        expect(at("bot-deleted-badge")).not.toBeNull();
        expect(textAt("metric-total-pnl")).toBe("15.00");
    });

    it("badges the strategy version only when one bot has more than one", () => {
        render([botTrade({ netProfit: "10" })]);
        expect(at("bot-version-badge")).toBeNull();
        if (component) unmount(component);
        component = null;
        host.innerHTML = "";

        render([
            botTrade({ strategyHash: HASH_A, netProfit: "10" }),
            botTrade({
                strategyHash: HASH_B,
                netProfit: "5",
                exitDate: "2026-01-04T06:00:00.000Z",
            }),
        ]);
        expect(at("bot-version-badge")).not.toBeNull();
    });

    it("reports the picked bot to the host, and reports the clearing too", () => {
        const onselect = vi.fn();
        render([botTrade({ netProfit: "10" })], { onselect });

        const head = host.querySelector<HTMLElement>(
            '[data-testid="bot-card-bot-1"] button',
        );
        expect(head).not.toBeNull();
        head?.click();
        flushSync();

        expect(onselect).toHaveBeenCalledWith("bot-1");
    });

    it("offers a way back to every trade while one bot is selected", () => {
        const onselect = vi.fn();
        render([botTrade({ netProfit: "10" })], {
            selectedBotId: "bot-1",
            onselect,
        });

        const clear = at("bot-filter-clear");
        expect(clear).not.toBeNull();
        clear?.click();
        flushSync();

        expect(onselect).toHaveBeenCalledWith("");
    });

    it("draws the equity sparkline once a bot has more than one closed trade", () => {
        render([botTrade({ netProfit: "10" })]);
        expect(at("bot-sparkline")).toBeNull();
        if (component) unmount(component);
        component = null;
        host.innerHTML = "";

        render([
            botTrade({ netProfit: "10" }),
            botTrade({ netProfit: "-4", exitDate: "2026-01-02T06:00:00.000Z" }),
        ]);
        const polyline = host.querySelector("polyline");
        expect(polyline?.getAttribute("points")).toBe("0.00,0.00 120.00,28.00");
    });
});
