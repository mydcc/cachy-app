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
 * FEAT-0822 — the guard decisions, pure.
 *
 * Every "may this bot act?" answer the engine needs, as functions over
 * plain data. Pure on purpose: the same function answers the enforcement
 * question (refuse a submission) and the projection question (show
 * `limit reached` on the row), so the two can never disagree about whether
 * a limit binds.
 *
 * The module imports nothing from the app — no store, no service, not even
 * the document types: callers hand in plain fields. That keeps it testable
 * without a rule store, and keeps it out of every import-graph cycle.
 */

import { Decimal } from "decimal.js";

/**
 * How often a bot may open a position, as the document spells it. The
 * mirror of `FiringPolicy` in `../lib/rules/types.ts`, restated so this
 * module stays import-free of the schema layer.
 */
export type FiringPolicyLite = "once" | "once_per_candle" | "multi";

/** Which limit binds, in the order the checks run. */
export type BotLimitReason =
    | "policy-once"
    | "entries-day"
    | "positions"
    | "risk"
    | "budget";

/** An owned row, as the guard layer reads it — plain strings off the book. */
export interface OwnedRowLite {
    positionId: string;
    symbol: string;
    side: "long" | "short";
    amount: string;
    entryPrice: string;
}

/** A resting order, as the guard layer reads it. Only stops matter here. */
export interface RestingOrderLite {
    orderId: string;
    symbol: string;
    /** The plan leg this order is: `"TP"` or `"SL"` on the paper book. */
    planType?: string;
    triggerPrice?: string;
    reduceOnly?: boolean;
    positionId?: string;
}

/** Everything the limit checks need, pre-read by the caller. */
export interface GuardCheckInputs {
    /** The document's firing policy. */
    policy: FiringPolicyLite;
    /** Entries that landed, ever — what `once` expires against. */
    entriesTotal: number;
    /** Entries that landed today, in the trader's local day. */
    entriesToday: number;
    /** The document's explicit position cap, if it states one. */
    maxPositions?: number;
    /** The document's explicit per-day entry cap, if it states one. */
    maxEntriesPerDay?: number;
    /** The document's per-entry risk ceiling, in account currency. */
    maxRiskPerPosition?: string;
    /** The document's total open-risk cap, in account currency. */
    budgetCap?: string;
    /** Rows the bot currently owns. */
    ownedCount: number;
    /** The open risk those rows hold (their resting stops), already summed. */
    riskUsed: Decimal;
    /**
     * Whether any owned row's risk could not be measured — a stop that has
     * filled, was cancelled, or sits on the wrong side of its entry. The
     * budget cap binds when this is true: a budget that cannot prove its
     * room has none (fail-closed, the same word `openRiskOfRow`'s `null`
     * means).
     */
    riskUnmeasurable?: boolean;
    /** The risk the entry being submitted would add, when one is pending. */
    entryRisk?: Decimal;
}

/**
 * The risk one entry carries: the distance to its stop, times the quantity.
 *
 * The true risk whatever the sizing basis was — `percent_risk` sized the
 * quantity to produce exactly this number, and the other bases produce a
 * quantity whose risk this is. Never the notional, never the margin: the
 * trader's word for "what I can lose on this" is the stop distance.
 */
export function entryRiskAmount(
    entryPrice: Decimal,
    qty: Decimal,
    stopPrice: Decimal,
): Decimal {
    return entryPrice.minus(stopPrice).abs().times(qty);
}

/**
 * The open risk one owned row still holds, read from its resting stop by
 * position id — or `null` when no resting stop answers for it.
 *
 * `null`, not zero: zero would claim the position is protected when
 * nothing says it is. A stop that has already filled no longer rests in
 * the book, and the honest answer about its row is "risk unknown", which
 * the budget check treats as unmeasurable rather than free.
 */
export function openRiskOfRow(
    row: OwnedRowLite,
    orders: readonly RestingOrderLite[],
): Decimal | null {
    // The stop leg, not the first reduce-only leg: a take-profit of the same
    // position is also `reduceOnly` with a `triggerPrice` and the same
    // `positionId`, and pricing a row by its profit target claims protection
    // the row does not have. `planType` is what the book wrote the leg as.
    const stop = orders.find(
        (o) =>
            o.planType === "SL" &&
            o.reduceOnly === true &&
            o.positionId === row.positionId &&
            typeof o.triggerPrice === "string",
    );
    if (!stop) return null;

    const entry = new Decimal(row.entryPrice);
    const trigger = new Decimal(stop.triggerPrice ?? "0");
    if (!entry.isFinite() || !trigger.isFinite()) return null;

    // A stop on the wrong side of its entry no longer bounds the loss it was
    // priced against — a long whose trigger sits above its entry can lose
    // everything below it, whatever the trigger says. Wrong side is not a
    // (negative) risk number, it is the absence of one: `null`, the answer
    // the budget treats as unmeasurable rather than free.
    const lossSide =
        row.side === "short" ? trigger.gt(entry) : trigger.lt(entry);
    if (!lossSide) return null;

    return entryRiskAmount(entry, new Decimal(row.amount), trigger);
}

/**
 * Which limits bind, in the order the engine asks: policy, day, positions,
 * then the two risk caps. All of them, in one pass — a submission refused
 * for two reasons is told about both, exactly as the document validator
 * reports every field at once.
 *
 * Absent limits bind nothing. The absent position cap is the single-open
 * bound FEAT-0488 already enforced, which is not this function's refusal
 * to make: `position-already-open` names that truth better, because it is
 * true of every bot and not a limit anyone set.
 */
export function limitReasonsFor(inputs: GuardCheckInputs): BotLimitReason[] {
    const reasons: BotLimitReason[] = [];

    if (inputs.policy === "once" && inputs.entriesTotal >= 1) {
        reasons.push("policy-once");
    }
    if (
        inputs.maxEntriesPerDay !== undefined &&
        inputs.entriesToday >= inputs.maxEntriesPerDay
    ) {
        reasons.push("entries-day");
    }
    if (inputs.maxPositions !== undefined && inputs.ownedCount >= inputs.maxPositions) {
        reasons.push("positions");
    }
    if (
        inputs.maxRiskPerPosition !== undefined &&
        inputs.entryRisk !== undefined &&
        inputs.entryRisk.gt(inputs.maxRiskPerPosition)
    ) {
        reasons.push("risk");
    }
    if (inputs.budgetCap !== undefined) {
        // Unmeasurable risk binds before any arithmetic: a budget whose
        // held risk cannot be summed has no provable room, and `entryRisk`
        // only ever adds to that unknown. Fail-closed — the alternative is
        // admitting an entry against a cap nobody could check.
        if (inputs.riskUnmeasurable === true) {
            reasons.push("budget");
        } else {
            const total = inputs.riskUsed.plus(inputs.entryRisk ?? 0);
            // Two comparators, one limit, both honest: with an entry pending the
            // cap is inclusive (landing exactly on it is allowed); without one,
            // "reached" means nothing more fits, and holding the whole budget
            // is that state. The row's `limit reached` chip answers the second
            // question, the submission refusal the first.
            const reached =
                inputs.entryRisk === undefined
                    ? total.gte(inputs.budgetCap)
                    : total.gt(inputs.budgetCap);
            if (reached) {
                reasons.push("budget");
            }
        }
    }

    return reasons;
}

/**
 * The trader's day as a string, from local time — "today" is their word,
 * and a cap that resets at UTC midnight resets mid-afternoon for half the
 * planet.
 */
export function localDayKey(at: Date = new Date()): string {
    const year = at.getFullYear();
    const month = `${at.getMonth() + 1}`.padStart(2, "0");
    const day = `${at.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
}
