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
 * Paper trades in the journal — FEAT-0327.
 *
 * A simulated trade you cannot review afterwards has taught you nothing, and
 * reviewing is most of what paper trading is for. So a position opening writes
 * an `Open` entry immediately and closing completes it, rather than waiting
 * for a history poll the way the live path does — the simulator knows every
 * fill exactly, at the moment it happens, which is more than the live path can
 * say for itself.
 *
 * Reconciliation, not a change feed. Every pass reads the book and makes the
 * journal agree with it: a position with no linked entry gets one, a link
 * whose position is gone gets completed. That makes a missed notification, an
 * interrupted reload or a half-written pass self-correcting, where a cursor
 * over the fill list would drift silently and write the same trade twice.
 *
 * Class A on both sides (ADR-0001). Nothing here leaves the device.
 */

import { Decimal } from "decimal.js";
import { paperState, type PaperFill, type PaperPosition } from "../stores/paperTrading.svelte";
import { journalState } from "../stores/journal.svelte";
import { logger } from "./logger";
import type { JournalEntry } from "../stores/types";
import { generateId } from "../utils/utils";

interface FillTotals {
    openQty: Decimal;
    openNotional: Decimal;
    entryFee: Decimal;
    closeQty: Decimal;
    closeNotional: Decimal;
    exitFee: Decimal;
    /** Σ realised PnL over the closing fills, each already net of its own fee. */
    closeRealized: Decimal;
    lastCloseAt: number;
}

function sumFills(positionId: string): FillTotals {
    const totals: FillTotals = {
        openQty: new Decimal(0),
        openNotional: new Decimal(0),
        entryFee: new Decimal(0),
        closeQty: new Decimal(0),
        closeNotional: new Decimal(0),
        exitFee: new Decimal(0),
        closeRealized: new Decimal(0),
        lastCloseAt: 0,
    };

    for (const fill of paperState.fills as readonly PaperFill[]) {
        if (fill.positionId !== positionId) continue;
        const qty = new Decimal(fill.qty);
        const price = new Decimal(fill.price);
        const fee = new Decimal(fill.fee);
        if (fill.tradeSide === "OPEN") {
            totals.openQty = totals.openQty.plus(qty);
            totals.openNotional = totals.openNotional.plus(price.times(qty));
            totals.entryFee = totals.entryFee.plus(fee);
        } else {
            totals.closeQty = totals.closeQty.plus(qty);
            totals.closeNotional = totals.closeNotional.plus(price.times(qty));
            totals.exitFee = totals.exitFee.plus(fee);
            totals.closeRealized = totals.closeRealized.plus(fill.realizedPnl);
            totals.lastCloseAt = Math.max(totals.lastCloseAt, fill.createdAt);
        }
    }

    // Fallback to metadata if entry fee was evicted (500-fill cap). The entry fill
    // can be evicted while the position is still open, stranding the journal link.
    if (totals.entryFee.eq(0) && totals.openQty.eq(0)) {
        const meta = paperState.getPositionMetadata(positionId);
        if (meta) {
            totals.entryFee = new Decimal(meta.entryFee);
        }
    }

    return totals;
}

/** The stop the position was taken with, from the plan resting against it. */
function plannedStop(position: PaperPosition): Decimal | null {
    const plan = paperState.orders.find(
        (o) => o.positionId === position.positionId && o.planType === "SL",
    );
    const price = plan?.triggerPrice;
    return price === undefined ? null : new Decimal(price);
}

/** The target the position was taken with, if one was attached. */
function plannedTarget(position: PaperPosition): Decimal | null {
    const plan = paperState.orders.find(
        (o) => o.positionId === position.positionId && o.planType === "TP",
    );
    const price = plan?.triggerPrice;
    return price === undefined ? null : new Decimal(price);
}

/**
 * What the trade risked: the distance to the stop over the size held.
 *
 * Zero when no stop was attached — an unknown risk reported as a number would
 * make every R multiple downstream a fiction, and zero is the value the R
 * calculation already treats as "not computable".
 */
function riskOf(position: PaperPosition, stop: Decimal | null): Decimal {
    if (stop === null || stop.lte(0)) return new Decimal(0);
    return new Decimal(position.entryPrice).minus(stop).abs().times(position.amount);
}

class PaperJournalService {
    /**
     * Makes the journal agree with the simulated book.
     *
     * Cheap enough to call after every book change: it touches the journal
     * only when a position appeared, materially changed, or went away. Price
     * movement alone changes nothing here — rewriting an open entry on every
     * tick would serialise the whole journal to `localStorage` once a second
     * for an unrealised number the panel already shows live.
     */
    public reconcile(): void {
        if (!paperState.enabled) return;
        try {
            this.openEntries();
            this.completeClosedEntries();
        } catch (e) {
            // A journal that cannot be written must not take the simulated
            // book down with it. The book is the record; this is the report.
            logger.warn("market", "[Paper] Journal reconciliation failed", e);
        }
    }

    /** Creates or refreshes the entry following each open position. */
    private openEntries(): void {
        for (const position of paperState.positions) {
            const linked = paperState.journalLink(position.positionId);
            if (linked === undefined) {
                this.createEntry(position);
                continue;
            }
            const existing = journalState.entries.find((e) => e.id === linked);
            if (existing === undefined) {
                // The user deleted it. That is their record to delete, so the
                // link goes rather than the entry coming back.
                paperState.clearJournalLink(position.positionId);
                continue;
            }
            this.refreshOpenEntry(existing, position);
        }
    }

    private createEntry(position: PaperPosition): void {
        const stop = plannedStop(position);
        const target = plannedTarget(position);
        const totals = sumFills(position.positionId);
        const risk = riskOf(position, stop);
        const accountSize = new Decimal(
            position.accountSizeAtEntry ?? paperState.balance.toString(),
        );

        const entry: JournalEntry = {
            id: generateId(),
            // Traceable back to the simulated position it describes, the way
            // a synced live entry carries the venue's position id.
            tradeId: position.positionId,
            date: new Date(position.openedAt).toISOString(),
            entryDate: new Date(position.openedAt).toISOString(),
            symbol: position.symbol,
            tradeType: position.side,
            status: "Open",
            accountSize,
            riskPercentage: accountSize.gt(0)
                ? risk.div(accountSize).times(100)
                : new Decimal(0),
            leverage: new Decimal(position.leverage),
            fees: totals.entryFee,
            entryPrice: new Decimal(position.entryPrice),
            stopLossPrice: stop ?? new Decimal(0),
            totalRR: new Decimal(0),
            totalNetProfit: new Decimal(0),
            riskAmount: risk,
            totalFees: totals.entryFee,
            entryFee: totals.entryFee,
            entryFeeType: "taker",
            maxPotentialProfit:
                target !== null
                    ? target.minus(position.entryPrice).abs().times(position.amount)
                    : new Decimal(0),
            notes: "",
            targets:
                target !== null
                    ? [{ price: target, percent: new Decimal(100), isLocked: false }]
                    : [],
            calculatedTpDetails: [],
            positionSize: new Decimal(position.amount),
            isManual: false,
            isPaper: true,
            tags: [],
        };

        // `addEntry` refuses when the user has asked not to journal simulated
        // fills. No link is stored then, so the close writes nothing either —
        // the setting drops the trade at the door rather than leaving a half
        // record behind.
        if (journalState.addEntry(entry)) {
            paperState.setJournalLink(position.positionId, String(entry.id));
        }
    }

    /**
     * Keeps an open entry current with adds and partial closes.
     *
     * Guarded on the numbers that describe the trade, not on the clock: a
     * position whose size, basis and realised total are unchanged has nothing
     * new to say, whatever the price did.
     *
     * Risk is frozen at entry: after a partial close, riskAmount stays the same
     * even though position size decreased. This prevents the denominator from
     * shrinking incorrectly and inflating the R-multiple on the remainder.
     */
    private refreshOpenEntry(existing: JournalEntry, position: PaperPosition): void {
        const totals = sumFills(position.positionId);
        const stop = plannedStop(position) ?? existing.stopLossPrice;
        const size = new Decimal(position.amount);
        const entryPrice = new Decimal(position.entryPrice);
        const realized = new Decimal(position.realizedPnl);

        const unchanged =
            existing.positionSize?.eq(size) === true &&
            existing.entryPrice.eq(entryPrice) &&
            existing.totalFees.eq(totals.entryFee.plus(totals.exitFee)) &&
            (existing.realizedPnl ?? new Decimal(0)).eq(realized) &&
            existing.stopLossPrice.eq(stop);
        if (unchanged) return;

        // Risk frozen at entry: use the stored amount if available, else fall back to
        // existing riskAmount (from journal) or calculate if this is the first refresh.
        let risk = new Decimal(position.riskAmountAtEntry ?? existing.riskAmount ?? 0);
        if (risk.eq(0) && stop.gt(0)) {
            // No frozen risk yet (stop wasn't known at open, or first refresh after stop was added).
            // Calculate it once; future partials will use this frozen value.
            risk = riskOf(position, stop);
            // Store the frozen risk back to the position so it stays frozen on subsequent refreshes.
            const updatedPositions = paperState.positions.map((p) =>
                p.positionId === position.positionId
                    ? { ...p, riskAmountAtEntry: risk.toString() }
                    : p,
            );
            paperState.setPositions(updatedPositions);
        }

        journalState.updateEntry({
            ...existing,
            entryPrice,
            positionSize: size,
            stopLossPrice: stop,
            riskAmount: risk,
            riskPercentage: existing.accountSize.gt(0)
                ? risk.div(existing.accountSize).times(100)
                : new Decimal(0),
            leverage: new Decimal(position.leverage),
            entryFee: totals.entryFee,
            exitFee: totals.exitFee,
            fees: totals.entryFee,
            totalFees: totals.entryFee.plus(totals.exitFee),
            realizedPnl: realized,
        });
    }

    /**
     * Completes the entry of every position that has gone away.
     *
     * A link outliving its position is exactly the signal that the trade
     * finished — the simulator removes a position the moment its last unit is
     * closed, and the fills it left behind say at what prices.
     */
    private completeClosedEntries(): void {
        const open = new Set(paperState.positions.map((p) => p.positionId));
        for (const fill of paperState.fills) {
            if (open.has(fill.positionId)) continue;
            const linked = paperState.journalLink(fill.positionId);
            if (linked === undefined) continue;
            this.completeEntry(fill.positionId, linked);
        }
    }

    private completeEntry(positionId: string, entryId: string): void {
        const existing = journalState.entries.find((e) => e.id === entryId);
        if (existing === undefined) {
            paperState.clearJournalLink(positionId);
            return;
        }

        const totals = sumFills(positionId);
        if (totals.closeQty.lte(0)) {
            // Nothing closed, yet the position is gone. Not a state the
            // simulator produces; leaving the entry alone beats writing an
            // exit price derived from no fill at all.
            paperState.clearJournalLink(positionId);
            return;
        }

        const exitPrice = totals.closeNotional.div(totals.closeQty);
        // Each closing fill's realised PnL is already net of its own exit fee;
        // the entry fee was charged separately when the position opened, so it
        // is the one cost still to come off.
        const netProfit = totals.closeRealized.minus(totals.entryFee);
        const risk = existing.riskAmount ?? new Decimal(0);

        journalState.updateEntry({
            ...existing,
            status: netProfit.gte(0) ? "Won" : "Lost",
            exitPrice,
            exitDate: new Date(totals.lastCloseAt).toISOString(),
            totalNetProfit: netProfit,
            realizedPnl: netProfit,
            entryFee: totals.entryFee,
            exitFee: totals.exitFee,
            exitFeeType: "taker",
            fees: totals.entryFee.plus(totals.exitFee),
            totalFees: totals.entryFee.plus(totals.exitFee),
            totalRR: risk.gt(0) ? netProfit.div(risk) : new Decimal(0),
            positionSize: totals.closeQty,
        });
        paperState.clearJournalLink(positionId);
    }
}

export const paperJournalService = new PaperJournalService();
