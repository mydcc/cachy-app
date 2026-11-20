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
 * FEAT-0812 — what a bot actually did, read off the journal.
 *
 * ## No second ledger
 *
 * Every figure here is derived from journal entries and nothing else. The
 * journal is already the record of what happened (FEAT-0806 put each trade's
 * owner on it), so a separate per-bot store would be a second set of books
 * that can disagree with the first — and the first is the one the trader
 * exports, edits and deletes from.
 *
 * That has a consequence worth naming: deleting a bot does not touch its
 * track record, because the record was never stored against the rule. Nothing
 * in this module reads the rule store, which is what makes that guarantee
 * structural rather than a promise.
 *
 * ## One record per strategy version
 *
 * Grouped by `(botId, strategyHash)`, not by bot alone. A rule that was edited
 * is a different strategy, and averaging the figures of two strategies into
 * one number answers no question a trader has. The bot's name is the label;
 * the hash is what makes two cards two cards.
 *
 * ## The bot's exit and a human's are not the same event
 *
 * A position the bot opened and a human closed by hand says nothing about
 * whether the bot's exit works — the exit never ran. Those trades are counted
 * and shown in a row of their own, and kept out of the win rate, the
 * expectancy, the drawdown and the equity curve. Pretending otherwise would
 * credit or blame the bot for a decision it did not make.
 *
 * Class A throughout (ADR-0001): journal data, on the device.
 */

import { Decimal } from "decimal.js";

import { CLOSED_JOURNAL_STATUSES } from "./journalStatus";
import type { JournalEntry } from "../stores/types";

/** The figures one bot's one strategy version earned. */
export interface BotTrackRecord {
    /** Grouping key, stable across a rule's deletion. */
    botId: string;
    /** The 64-hex version the trades fired under; null when none was stored. */
    strategyHash: string | null;
    /** Closed trades the bot itself exited — what every figure below covers. */
    trades: number;
    wins: number;
    losses: number;
    /** Percent, 0–100. */
    winRate: Decimal;
    /** Mean realised R over the counted trades. */
    avgR: Decimal;
    /** Per-trade expectancy in quote currency, the journal's own formula. */
    expectancy: Decimal;
    /** Largest peak-to-trough fall of the cumulative result, as a positive. */
    maxDrawdown: Decimal;
    totalPnl: Decimal;
    /** Mean holding time in milliseconds, or null when no trade carries both ends. */
    avgHoldingMs: Decimal | null;
    /** Cumulative result after each counted trade, oldest close first. */
    equityCurve: Decimal[];
    /** Bot-opened, closed by hand. Counted, shown apart, never a bot exit. */
    manualExits: number;
    /** What those manual exits came to, so the row can say it rather than hint. */
    manualExitPnl: Decimal;
    /** Still running, so not yet part of any figure above. */
    openTrades: number;
    /** Latest activity (close, else entry date) in epoch ms — the sort key. */
    lastActivityMs: number;
}

/** Which population of the journal a view wants. */
export type JournalOriginFilter = "all" | "bots" | "manual";

const ZERO = new Decimal(0);

function isClosed(entry: JournalEntry): boolean {
    return CLOSED_JOURNAL_STATUSES.has(entry.status);
}

/** A trade a bot opened. `origin` is the recorded fact, not an inference. */
export function isBotEntry(entry: JournalEntry): boolean {
    return entry.origin === "bot" && typeof entry.botId === "string";
}

/**
 * Whether a human ended a bot's trade.
 *
 * Absent `exitOrigin` on a closed bot trade reads as the bot's exit: the field
 * is newer than the trades, and calling history "manual" because nobody wrote
 * the fact down would be an invention. See `JournalEntry.exitOrigin`.
 */
function isManualExit(entry: JournalEntry): boolean {
    return entry.exitOrigin === "manual";
}

function decimalOf(value: Decimal | undefined): Decimal {
    return value instanceof Decimal ? value : new Decimal(value ?? 0);
}

/** Epoch ms of a timestamp the journal stores, or null when unreadable. */
function msOf(iso: string | undefined): number | null {
    if (typeof iso !== "string" || iso === "") return null;
    const ms = Date.parse(iso);
    return Number.isNaN(ms) ? null : ms;
}

/** How many closed trades carry no attribution at all — the legacy population. */
export function unattributedClosedCount(entries: JournalEntry[]): number {
    let count = 0;
    for (const entry of entries) {
        if (entry.origin === undefined && isClosed(entry)) count++;
    }
    return count;
}

/**
 * Does this entry belong in a view filtered by origin and, optionally, by bot?
 *
 * `manual` means the trade was recorded as a human's. An entry with no origin
 * at all is neither — it predates attribution, and claiming it for either side
 * would be the guess this feature exists to avoid.
 */
export function matchesOriginFilter(
    entry: JournalEntry,
    filter: JournalOriginFilter,
    botId: string = "",
): boolean {
    if (botId !== "") {
        return isBotEntry(entry) && entry.botId === botId;
    }
    if (filter === "bots") return isBotEntry(entry);
    if (filter === "manual") return entry.origin === "manual";
    return true;
}

/** The journal's live/paper/all switch, which runs before the bot filter. */
export type JournalTradeMode = "live" | "paper" | "all";

/**
 * FEAT-0825 / ADR-0028 — the entries one side of the journal's account switch
 * shows. The bot cards read through this, so a `live` journal lists no paper
 * bot's track record beside live money; `all` stays the explicit way to see
 * both accounts together.
 */
export function entriesForTradeMode(
    entries: readonly JournalEntry[],
    mode: JournalTradeMode,
): JournalEntry[] {
    if (mode === "all") return [...entries];
    const wantsPaper = mode === "paper";
    return entries.filter((entry) => (entry.isPaper === true) === wantsPaper);
}

/**
 * The trade mode a bot's rows need, or `null` to leave the mode alone.
 *
 * The journal applies its live/paper switch before the bot filter, and every
 * bot trade is a paper trade — both bot lanes refuse while paper trading is
 * off — so from a `live` view, clicking a card the trader can see left the
 * table empty (Devin review). Since FEAT-0825 the cards themselves follow
 * the mode (`entriesForTradeMode`), so this widening only matters for the
 * dropdown and for a bot that ever trades on both sides. Widening only when the current mode
 * hides every one of that bot's trades leaves a deliberate `paper` choice
 * alone, and keeps working if a bot ever trades live.
 */
export function modeForBot(
    entries: readonly JournalEntry[],
    botId: string,
    mode: JournalTradeMode,
): JournalTradeMode | null {
    if (botId === "" || mode === "all") return null;
    const wantsPaper = mode === "paper";
    const visible = entries.some(
        (entry) =>
            isBotEntry(entry) &&
            entry.botId === botId &&
            (entry.isPaper === true) === wantsPaper,
    );
    return visible ? null : "all";
}

interface Bucket {
    botId: string;
    strategyHash: string | null;
    counted: JournalEntry[];
    manualExits: JournalEntry[];
    openTrades: number;
    lastActivityMs: number;
}

/**
 * Every bot's track record, most recently active first.
 *
 * Trades the bot did not open are ignored, and so are trades that carry no
 * attribution — a record built over "probably this bot's" would be worse than
 * no record, because it reads exactly as authoritative.
 */
export function botTrackRecords(entries: JournalEntry[]): BotTrackRecord[] {
    const buckets = new Map<string, Bucket>();

    for (const entry of entries) {
        if (!isBotEntry(entry)) continue;
        const botId = entry.botId as string;
        const strategyHash = entry.strategyHash ?? null;
        const key = `${botId}\u0000${strategyHash ?? ""}`;

        let bucket = buckets.get(key);
        if (bucket === undefined) {
            bucket = {
                botId,
                strategyHash,
                counted: [],
                manualExits: [],
                openTrades: 0,
                lastActivityMs: 0,
            };
            buckets.set(key, bucket);
        }

        const activityMs = msOf(entry.exitDate) ?? msOf(entry.date) ?? 0;
        if (activityMs > bucket.lastActivityMs) bucket.lastActivityMs = activityMs;

        if (!isClosed(entry)) {
            bucket.openTrades++;
        } else if (isManualExit(entry)) {
            bucket.manualExits.push(entry);
        } else {
            bucket.counted.push(entry);
        }
    }

    const records = [...buckets.values()].map(summarise);
    // Most recently active first; the bot id breaks ties so the order of two
    // records that closed in the same millisecond does not depend on the
    // journal's internal order.
    records.sort(
        (a, b) =>
            b.lastActivityMs - a.lastActivityMs || a.botId.localeCompare(b.botId),
    );
    return records;
}

function summarise(bucket: Bucket): BotTrackRecord {
    // Ordered by close, so the equity curve and the drawdown describe the
    // sequence the trader lived through rather than the order of the array.
    const counted = [...bucket.counted].sort(
        (a, b) => (msOf(a.exitDate) ?? 0) - (msOf(b.exitDate) ?? 0),
    );

    let wins = 0;
    let losses = 0;
    let totalPnl = ZERO;
    let winProfit = ZERO;
    let lossAmount = ZERO;
    let rSum = ZERO;
    let cumulative = ZERO;
    let peak = ZERO;
    let maxDrawdown = ZERO;
    let holdingSum = ZERO;
    let holdingCount = 0;
    const equityCurve: Decimal[] = [];

    for (const entry of counted) {
        const pnl = decimalOf(entry.totalNetProfit);
        totalPnl = totalPnl.plus(pnl);
        rSum = rSum.plus(decimalOf(entry.totalRR));

        if (entry.status === "Won") {
            wins++;
            winProfit = winProfit.plus(pnl);
        } else if (entry.status === "Lost") {
            losses++;
            lossAmount = lossAmount.plus(pnl.abs());
        }

        cumulative = cumulative.plus(pnl);
        equityCurve.push(cumulative);
        if (cumulative.gt(peak)) peak = cumulative;
        const drawdown = peak.minus(cumulative);
        if (drawdown.gt(maxDrawdown)) maxDrawdown = drawdown;

        const entryMs = msOf(entry.entryDate) ?? msOf(entry.date);
        const exitMs = msOf(entry.exitDate);
        if (entryMs !== null && exitMs !== null && exitMs >= entryMs) {
            holdingSum = holdingSum.plus(exitMs - entryMs);
            holdingCount++;
        }
    }

    const trades = counted.length;
    const tradeCount = new Decimal(trades);
    const winRate = trades > 0 ? new Decimal(wins).div(tradeCount).times(100) : ZERO;
    const avgR = trades > 0 ? rSum.div(tradeCount) : ZERO;
    const avgWin = wins > 0 ? winProfit.div(wins) : ZERO;
    const avgLoss = losses > 0 ? lossAmount.div(losses) : ZERO;
    // The journal's own expectancy: the share of wins times what a win pays,
    // less the share of losses times what a loss costs. Same formula as
    // `calculatePerformanceStats`, so two surfaces cannot report two numbers.
    const expectancy =
        trades > 0
            ? new Decimal(wins)
                  .div(tradeCount)
                  .times(avgWin)
                  .minus(new Decimal(losses).div(tradeCount).times(avgLoss))
            : ZERO;

    let manualExitPnl = ZERO;
    for (const entry of bucket.manualExits) {
        manualExitPnl = manualExitPnl.plus(decimalOf(entry.totalNetProfit));
    }

    return {
        botId: bucket.botId,
        strategyHash: bucket.strategyHash,
        trades,
        wins,
        losses,
        winRate,
        avgR,
        expectancy,
        maxDrawdown,
        totalPnl,
        avgHoldingMs: holdingCount > 0 ? holdingSum.div(holdingCount) : null,
        equityCurve,
        manualExits: bucket.manualExits.length,
        manualExitPnl,
        openTrades: bucket.openTrades,
        lastActivityMs: bucket.lastActivityMs,
    };
}
