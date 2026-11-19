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
import { Decimal } from "decimal.js";
import { limitReasonsFor } from "./botGuards";

/** An owned row's risk before anything is known about it — never `null` in
 * the projection's book, because the enforcement lane refuses on unknown
 * rather than admitting it as free. */
const ZERO_RISK = new Decimal(0);

export type BotState =
    | "armed"
    | "submitting"
    | "in_position"
    | "closing"
    | "closed"
    | "paused"
    | "blocked"
    | "expired"
    | "limit_reached";

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
    /**
     * FEAT-0822 — entries each bot landed today, from the same durable
     * counter the day cap enforces with. The store keys it by bot id.
     */
    entriesToday: ReadonlyMap<string, number>;
    /**
     * FEAT-0822 — the open risk each bot's rows still hold, keyed by bot id:
     * the summed resting-stop risk, or `null` when any row's risk could not
     * be measured (no stop answering, or one on the wrong side of its
     * entry). Null never reads as zero — the standing chip treats an
     * unmeasurable budget as reached, mirroring the enforcement lane's
     * fail-closed refusal.
     */
    budgetUsed: ReadonlyMap<string, Decimal | null>;
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

/**
 * The slot index's key: one paper position per symbol and side. `side` is
 * the position's side, not the order's direction — FEAT-0810 maps BUY/SELL
 * onto it itself, and a silent mismatch would make that join miss.
 */
export function slotKey(symbol: string, side: PaperPosition["side"]): string {
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
    //     by what it did, not by a deadline that passed under it. Above
    //     `limit_reached` on purpose: expiry is terminal, a day cap resets
    //     tomorrow, and a dead-forever bot must not read as temporarily
    //     limited.
    //   limit_reached — FEAT-0822. The standing limits (the day cap, the
    //     budget) bind an armed bot that cannot act: the trader's question
    //     is "why is it not firing?", and the limit is the answer. The other
    //     limit reasons never surface here — a bot at its position cap is
    //     holding (in_position above), and a once bot that entered reads
    //     closed, both of which say more than "limited".
    //   closed / armed — fired at least once, or ready to.
    if (book.submitting.has(rule.id)) return { state: "submitting", hasPosition };
    if (rule.enabled === false) return { state: "paused", hasPosition };
    if (book.unevaluable.has(rule.id)) return { state: "blocked", hasPosition };
    if (book.closing.has(rule.id) && hasPosition) return { state: "closing", hasPosition };
    if (hasPosition) return { state: "in_position", hasPosition };
    if (rule.valid_until_ms !== undefined && rule.valid_until_ms < now && fired === 0) {
        return { state: "expired", hasPosition };
    }
    if (standingLimitReached(rule, book)) return { state: "limit_reached", hasPosition };
    if (fired > 0) return { state: "closed", hasPosition };
    return { state: "armed", hasPosition };
}

/**
 * FEAT-0822 — whether one of the standing limits (the day cap, the budget)
 * binds an armed bot. The same pure function the enforcement lane refuses
 * submissions with, so the row's chip and the engine's refusal can never
 * disagree — computed with the entry's risk deliberately absent, because the
 * projection answers "could this bot act at all?", not "may this specific
 * entry through?".
 */
function standingLimitReached(rule: RuleDocument, book: BotBook): boolean {
    const budgetUsed = book.budgetUsed.get(rule.id);
    return limitReasonsFor({
        policy: rule.firing_policy ?? "once_per_candle",
        entriesTotal: 0,
        entriesToday: book.entriesToday.get(rule.id) ?? 0,
        maxEntriesPerDay: rule.max_entries_per_day,
        maxPositions: rule.max_positions,
        maxRiskPerPosition: rule.max_risk_per_position,
        budgetCap: rule.budget_cap,
        ownedCount: 0,
        riskUsed: budgetUsed ?? ZERO_RISK,
        riskUnmeasurable: budgetUsed === null,
    }).some((reason) => reason === "entries-day" || reason === "budget");
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
