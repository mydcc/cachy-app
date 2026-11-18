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

/**
 * FEAT-0807 — a bot's lifecycle state, derived from the rule and the book.
 *
 * No second truth: the state is a pure function of inputs a reload can
 * rebuild — the rule document, the projection of the simulated book, and the
 * clock. Storing it would create a blob that drifts the first time one input
 * changes without the others.
 *
 * One state, one flag. `paused` and `in_position` are not mutually exclusive
 * in reality — a paused bot can still hold a position — so the state stays a
 * single value and `hasPosition` carries the second fact, and the UI can say
 * "paused, position open" without inventing a compound enum.
 */

import type { RuleDocument } from "../../lib/rules/types";
import type { PaperPosition } from "../../stores/paperTrading.svelte";

export type BotState =
    | "armed"
    | "submitting"
    | "in_position"
    | "closing"
    | "closed"
    | "paused"
    | "blocked"
    | "expired";

/**
 * Everything the rule document cannot know about itself, pre-read by the
 * store: the book it may own rows in, the transients still in flight, the
 * loop's inert record, and how often each rule has fired.
 */
export interface BotBook {
    /** Open positions of the simulated book. */
    positions: readonly PaperPosition[];
    /** Rule ids with an entry submission still in flight (FEAT-0488's guard). */
    submitting: ReadonlySet<string>;
    /**
     * Rule ids with an exit submission still in flight. FEAT-0810 wires
     * this signal; until then the set is and stays empty, which is why
     * `closing` is reachable only through a test input today.
     */
    closing: ReadonlySet<string>;
    /** Rule ids the evaluation loop reported unevaluable. */
    unevaluable: ReadonlySet<string>;
    /** Fired count per rule id, from the rule-state ledger. */
    firedCounts: ReadonlyMap<string, number>;
}

/** One bot's answer to "what are you doing right now?". */
export interface BotLifeState {
    state: BotState;
    /** Carried beside the state, not folded into it. */
    hasPosition: boolean;
}

/** A paper position's owner, for the slot index FEAT-0808 and FEAT-0810 read. */
export interface OwnedSlot {
    positionId: string;
    botId: string;
}

/** The slot index's key: one paper position per symbol and side. */
export function slotKey(symbol: string, side: string): string {
    return `${symbol}|${side}`;
}

export function deriveBotState(rule: RuleDocument, book: BotBook, now: number): BotLifeState {
    // Ownership is a recorded fact of the open (FEAT-0806): the opening
    // stamp owns, a later add never re-attributes.
    const hasPosition = book.positions.some((p) => p.origin === "bot" && p.botId === rule.id);
    const fired = book.firedCounts.get(rule.id) ?? 0;

    // Precedence, most specific first; every row is pinned in the table
    // tests, because "which fact wins" is the whole design of a projection.
    //
    //   submitting — transient and settles in milliseconds; even a pause
    //     cannot recall an order already traveling to the book.
    //   paused — the trader's own switch beats anything the engine reports.
    //     An absent `enabled` reads active, the same reading the panel's
    //     toggle gives the document.
    //   blocked — the loop's inert record; a blocked bot can still hold the
    //     position it cannot manage, which `hasPosition` carries.
    //   closing — an exit in flight over an owned position. A closing signal
    //     without a position has nothing left to close and falls through.
    //   in_position — the book is the owner of record.
    //   expired — by definition never fired: a bot that acted is described
    //     by what it did, not by a deadline that passed under it.
    //   closed / armed — fired at least once, or ready to.
    if (book.submitting.has(rule.id)) return { state: "submitting", hasPosition };
    if (rule.enabled === false) return { state: "paused", hasPosition };
    if (book.unevaluable.has(rule.id)) return { state: "blocked", hasPosition };
    if (book.closing.has(rule.id) && hasPosition) return { state: "closing", hasPosition };
    if (hasPosition) return { state: "in_position", hasPosition };
    if (rule.valid_until_ms !== undefined && rule.valid_until_ms < now && fired === 0) {
        return { state: "expired", hasPosition };
    }
    if (fired > 0) return { state: "closed", hasPosition };
    return { state: "armed", hasPosition };
}

/**
 * Who owns each occupied (symbol, side) slot of the simulated book. Built
 * from the book alone: a deleted rule keeps its row in the index — the
 * sidebar (FEAT-0808) renders that as an owned position with no bot, and
 * FEAT-0810 reads the same entry to refuse a second bot the slot.
 *
 * Positions are all it reads — never the fire ledger or the loop's record —
 * so the store's slot projection stays keyed on the book alone.
 */
export function ownedSlots(positions: readonly PaperPosition[]): Map<string, OwnedSlot> {
    const slots = new Map<string, OwnedSlot>();
    for (const position of positions) {
        if (position.origin !== "bot" || position.botId === undefined) continue;
        slots.set(slotKey(position.symbol, position.side), {
            positionId: position.positionId,
            botId: position.botId,
        });
    }
    return slots;
}
