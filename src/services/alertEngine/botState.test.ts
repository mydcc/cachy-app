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
 * FEAT-0807 — a bot's state is derived, never stored.
 *
 * Every state in the enum is produced here from inputs a reload can rebuild
 * — the rule document, the book, and the clock — and every precedence choice
 * between them is a named row, because "which fact wins" is the whole design
 * of a projection that must not drift from its sources.
 */

import { describe, expect, it } from "vitest";

import type { RuleDocument } from "../../lib/rules/types";
import type { PaperPosition } from "../../stores/paperTrading.svelte";
import {
    deriveBotState,
    ownedSlots,
    slotKey,
    type BotBook,
    type BotState,
} from "./botState";

const NOW = 1000;

function botDocument(overrides: Partial<RuleDocument> = {}): RuleDocument {
    return {
        schema_version: 2,
        id: "bot-1",
        name: "a bot",
        symbol: "BTCUSDT",
        trigger_timeframe: "1h",
        conditions: {
            kind: "compare",
            left: { kind: "price", field: "close" },
            op: "gte",
            right: { kind: "constant", value: "50000" },
            timeframe: "1h",
        },
        action: { consequence_level: "simulate", order: { side: "buy", size_basis: "percent_of_equity", size: "1" } },
        enabled: true,
        provenance: { source: "human", created_at_ms: 0 },
        ...overrides,
    };
}

function position(overrides: Partial<PaperPosition> = {}): PaperPosition {
    return {
        positionId: "paper-pos-1",
        symbol: "BTCUSDT",
        side: "long",
        amount: "0.02",
        entryPrice: "50000",
        leverage: "1",
        marginMode: "isolated",
        realizedPnl: "0",
        openedAt: NOW,
        origin: "bot",
        botId: "bot-1",
        ...overrides,
    };
}

function book(overrides: Partial<BotBook> = {}): BotBook {
    return {
        positions: [],
        submitting: new Set<string>(),
        closing: new Set<string>(),
        unevaluable: new Set<string>(),
        firedCounts: new Map<string, number>(),
        ...overrides,
    };
}

interface Row {
    name: string;
    rule?: Partial<RuleDocument>;
    book?: Partial<BotBook>;
    /** Defaults to NOW. */
    now?: number;
    state: BotState;
    hasPosition: boolean;
}

const rows: Row[] = [
    {
        name: "enabled bot that has done nothing reads armed, not closed",
        state: "armed",
        hasPosition: false,
    },
    {
        name: "a bot that fired and no longer holds reads closed",
        book: { firedCounts: new Map([["bot-1", 1]]) },
        state: "closed",
        hasPosition: false,
    },
    {
        name: "a disabled bot reads paused",
        rule: { enabled: false },
        state: "paused",
        hasPosition: false,
    },
    {
        name: "a paused bot holding a position stays one value, hasPosition carries the second fact",
        rule: { enabled: false },
        book: { positions: [position()] },
        state: "paused",
        hasPosition: true,
    },
    {
        name: "an owned position reads in_position and never armed",
        book: { positions: [position()] },
        state: "in_position",
        hasPosition: true,
    },
    {
        name: "an entry in flight reads submitting",
        book: { submitting: new Set(["bot-1"]) },
        state: "submitting",
        hasPosition: false,
    },
    {
        name: "a submission in flight wins over the position it is adding to",
        book: { submitting: new Set(["bot-1"]), positions: [position()] },
        state: "submitting",
        hasPosition: true,
    },
    {
        name: "an exit in flight over an owned position reads closing",
        book: { closing: new Set(["bot-1"]), positions: [position()] },
        state: "closing",
        hasPosition: true,
    },
    {
        name: "a closing signal without an open position has nothing to close and reads armed",
        book: { closing: new Set(["bot-1"]) },
        state: "armed",
        hasPosition: false,
    },
    {
        name: "an unevaluable bot reads blocked",
        book: { unevaluable: new Set(["bot-1"]) },
        state: "blocked",
        hasPosition: false,
    },
    {
        name: "a blocked bot can still hold the position it cannot manage",
        book: { unevaluable: new Set(["bot-1"]), positions: [position()] },
        state: "blocked",
        hasPosition: true,
    },
    {
        name: "a never-fired bot past its expiry reads expired",
        rule: { valid_until_ms: 999 },
        state: "expired",
        hasPosition: false,
    },
    {
        name: "a never-fired bot inside its window reads armed",
        rule: { valid_until_ms: 2000 },
        state: "armed",
        hasPosition: false,
    },
    {
        name: "a bot that fired reads closed even past its expiry — expired means never fired",
        rule: { valid_until_ms: 999 },
        book: { firedCounts: new Map([["bot-1", 1]]) },
        state: "closed",
        hasPosition: false,
    },
    {
        name: "a bot past expiry that still holds reads in_position, not expired",
        rule: { valid_until_ms: 999 },
        book: { firedCounts: new Map([["bot-1", 1]]), positions: [position()] },
        state: "in_position",
        hasPosition: true,
    },
    {
        name: "a manual position on the same symbol is not owned",
        book: { positions: [position({ origin: "manual", botId: undefined })] },
        state: "armed",
        hasPosition: false,
    },
    {
        name: "another bot's position is not owned",
        book: { positions: [position({ botId: "bot-2" })] },
        state: "armed",
        hasPosition: false,
    },
    {
        name: "an absent enabled field reads active, like the panel's toggle does",
        rule: { enabled: undefined },
        state: "armed",
        hasPosition: false,
    },
    {
        name: "a submission in flight wins over a pause — the order is already traveling",
        rule: { enabled: false },
        book: { submitting: new Set(["bot-1"]) },
        state: "submitting",
        hasPosition: false,
    },
    {
        name: "the trader's switch beats the engine's inert record",
        rule: { enabled: false },
        book: { unevaluable: new Set(["bot-1"]) },
        state: "paused",
        hasPosition: false,
    },
    {
        name: "a blocked bot with an exit in flight stays blocked — the exit cannot run either",
        book: { unevaluable: new Set(["bot-1"]), closing: new Set(["bot-1"]), positions: [position()] },
        state: "blocked",
        hasPosition: true,
    },
    {
        // A pruned fire ledger (pruneRuleStates) leaves a lingering row with
        // fired 0: the position is the stronger recorded fact, so the row
        // also pins in_position above expired for the never-fired case.
        name: "a lingering position with a pruned ledger reads in_position, never expired",
        rule: { valid_until_ms: 999 },
        book: { positions: [position()] },
        state: "in_position",
        hasPosition: true,
    },
];

describe("FEAT-0807 — deriveBotState", () => {
    for (const row of rows) {
        it(row.name, () => {
            const result = deriveBotState(
                botDocument(row.rule ?? {}),
                book(row.book ?? {}),
                row.now ?? NOW,
            );
            expect(result.state).toBe(row.state);
            expect(result.hasPosition).toBe(row.hasPosition);
        });
    }

    it("is pure: the same inputs derive the same state twice and leave them unmutated", () => {
        const rule = botDocument();
        const input = book({ positions: [position()], firedCounts: new Map([["bot-1", 2]]) });
        const before = JSON.stringify(input.positions);

        const first = deriveBotState(rule, input, NOW);
        const second = deriveBotState(rule, input, NOW);

        expect(second).toEqual(first);
        expect(JSON.stringify(input.positions)).toBe(before);
    });

    it("keys slots by symbol and side, bot-stamped rows only", () => {
        const slots = ownedSlots([
            position({ positionId: "p-a", symbol: "BTCUSDT", side: "long", botId: "bot-1" }),
            position({ positionId: "p-b", symbol: "ETHUSDT", side: "short", botId: "bot-2" }),
            position({ positionId: "p-c", symbol: "SOLUSDT", side: "long", origin: "manual", botId: undefined }),
        ]);

        expect(slots.size).toBe(2);
        expect(slots.get(slotKey("BTCUSDT", "long"))).toEqual({ positionId: "p-a", botId: "bot-1" });
        expect(slots.get(slotKey("ETHUSDT", "short"))).toEqual({ positionId: "p-b", botId: "bot-2" });
        expect(slots.has(slotKey("SOLUSDT", "long"))).toBe(false);
    });

    it("indexes a lingering book row whose rule no longer exists — the book is the index's only source", () => {
        // No rule takes part: the row's botId names a deleted bot, and the
        // slot still answers "who owns this" for the sidebar (FEAT-0808).
        const slots = ownedSlots([
            position({ positionId: "p-gone", botId: "bot-deleted" }),
        ]);

        expect(slots.get(slotKey("BTCUSDT", "long"))).toEqual({
            positionId: "p-gone",
            botId: "bot-deleted",
        });
    });
});
