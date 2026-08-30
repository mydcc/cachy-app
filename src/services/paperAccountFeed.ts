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
 * The read seam — FEAT-0327.
 *
 * FEAT-0012 built one seam, at `tradeService.signedRequest`, and it is a
 * *write* seam: it decides where an order goes. Everything that reads account
 * state went around it and asked the venue, which is why a simulated position
 * was charged to a simulated balance and then rendered from a real one — or
 * rather, not rendered at all.
 *
 * This is the other half. One module answers the four account reads from the
 * simulated book, in the shapes the stores already hydrate from, and returns
 * `null` when paper mode is off so every call site falls through to the venue
 * unchanged. Live behaviour cannot drift here: the paper branch is an early
 * return, and there is nothing after it to get wrong.
 *
 * Nothing in this file writes. It maps the book into wire shapes; hydrating
 * the stores is `paperTradingService`'s job, and placing orders is still the
 * write seam's.
 */

import { Decimal } from "decimal.js";
import { paperState, type PaperFill, type PaperOrder, type PaperPosition } from "../stores/paperTrading.svelte";
import { marketState } from "../stores/market.svelte";
import type { NormalizedOrder, NormalizedPosition } from "../types/exchange";

/** The `/api/account` field set, as `PositionsSidebar` reads it. */
export interface PaperAccountInfo {
    available: string;
    margin: string;
    totalUnrealizedPnL: string;
    marginCoin: string;
    frozen: string;
    transfer: string;
    bonus: string;
    positionMode: string;
    crossUnrealizedPNL: string;
    isolationUnrealizedPNL: string;
}

export interface HistoryQuery {
    startTime?: number;
    endTime?: number;
    limit?: number;
}

/** The live mark price for a symbol, or null when the feed has none. */
function markPrice(symbol: string): Decimal | null {
    const data = marketState.data[symbol];
    const mark = data?.markPrice;
    if (mark instanceof Decimal && mark.gt(0)) return mark;
    const last = data?.lastPrice;
    if (last instanceof Decimal && last.gt(0)) return last;
    return null;
}

function unrealized(position: PaperPosition, mark: Decimal): Decimal {
    const amount = new Decimal(position.amount);
    const entry = new Decimal(position.entryPrice);
    return position.side === "long"
        ? mark.minus(entry).times(amount)
        : entry.minus(mark).times(amount);
}

/**
 * The initial margin the position would have required.
 *
 * Derived for display, **not reserved**: the simulator charges only the fee on
 * open (FEAT-0327 leaves margin accounting to its follow-up). It is reported
 * because the position card divides PnL by it to show ROI, and a zero there
 * renders as a broken row rather than as an honest absence. It deliberately
 * does not reach the account balance — `accountInfo()` reports zero used
 * margin, because claiming margin the balance has not actually set aside
 * would double-count the account's equity.
 */
function notionalMargin(position: PaperPosition): Decimal {
    const leverage = new Decimal(position.leverage);
    const notional = new Decimal(position.amount).times(position.entryPrice);
    return leverage.gt(0) ? notional.div(leverage) : notional;
}

function toNormalizedPosition(position: PaperPosition): NormalizedPosition {
    const mark = markPrice(position.symbol);
    return {
        positionId: position.positionId,
        symbol: position.symbol,
        side: position.side,
        size: position.amount,
        entryPrice: position.entryPrice,
        // No liquidation price: the simulator does not model liquidation, and
        // a number here would be read as one it will actually honour. The
        // store's `Decimal(0)` default already means "no data" to every
        // consumer (see resolveMarkPrice in PositionsSidebar).
        liquidationPrice: undefined,
        markPrice: (mark ?? new Decimal(position.entryPrice)).toString(),
        margin: notionalMargin(position).toString(),
        unrealizedPnL: unrealized(position, mark ?? new Decimal(position.entryPrice)).toString(),
        leverage: position.leverage,
        marginMode: position.marginMode,
        marginRate: undefined,
        realizedPnl: position.realizedPnl,
    };
}

function toNormalizedOrder(order: PaperOrder): NormalizedOrder {
    return {
        id: order.orderId,
        orderId: order.orderId,
        clientId: order.clientOrderId,
        symbol: order.symbol,
        type: order.orderType,
        side: order.side,
        // A trigger order has no limit price; the level that matters is the
        // trigger, and reporting it as the price is how the venue's own
        // pending list reads a stop.
        price: order.price ?? order.triggerPrice ?? null,
        amount: order.qty,
        filled: "0",
        status: "NEW",
        time: order.createdAt,
        reduceOnly: order.reduceOnly,
        fee: "0",
        realizedPNL: "0",
        ...(order.planType === "TP" ? { tpPrice: order.triggerPrice } : {}),
        ...(order.planType === "SL" ? { slPrice: order.triggerPrice } : {}),
    };
}

function toHistoryOrder(fill: PaperFill): NormalizedOrder {
    return {
        id: fill.fillId,
        orderId: fill.orderId,
        symbol: fill.symbol,
        type: fill.orderType,
        side: fill.side,
        price: fill.price,
        avgPrice: fill.price,
        amount: fill.qty,
        filled: fill.qty,
        status: "FILLED",
        time: fill.createdAt,
        mtime: fill.createdAt,
        reduceOnly: fill.tradeSide === "CLOSE",
        fee: fill.fee,
        realizedPNL: fill.realizedPnl,
    };
}

class PaperAccountFeed {
    /** Open simulated positions, as `accountState.hydratePositions` reads them. */
    public positions(): NormalizedPosition[] {
        return paperState.positions.map(toNormalizedPosition);
    }

    /**
     * Resting simulated orders — limits and triggers, not plans.
     *
     * TP/SL plans are deliberately absent: the venue keeps them on their own
     * endpoint and the panel gives them their own tab, which the simulator
     * now answers (`paperExchange.handleTpSl`). Listing them here as well
     * would show every stop twice, in a tab where cancelling one does not
     * mean what the row says it means.
     */
    public pendingOrders(): NormalizedOrder[] {
        return paperState.orders
            .filter((o) => o.planGroupId === undefined)
            .map(toNormalizedOrder);
    }

    /**
     * Executed fills, newest first, in the venue's history shape.
     *
     * The window is honoured so the history tab's range picker and its
     * "load more" behave as they do live, rather than silently ignoring a
     * range the user chose.
     */
    public historyOrders(query: HistoryQuery = {}): NormalizedOrder[] {
        const { startTime, endTime, limit = 50 } = query;
        return (
            [...paperState.fills]
                // Reversed before sorting, not after: two fills of the same
                // trade land in the same millisecond routinely — an entry and
                // its immediate close, or a stop firing on the tick that
                // crossed it — and a sort by timestamp alone leaves those in
                // the order they were appended, which is oldest first. The
                // book is already chronological, so reversing it first gives
                // the tie the right answer and a stable sort keeps it.
                .reverse()
                .filter((f) => {
                    if (startTime !== undefined && f.createdAt < startTime) return false;
                    if (endTime !== undefined && f.createdAt > endTime) return false;
                    return true;
                })
                .sort((a, b) => b.createdAt - a.createdAt)
                .slice(0, limit)
                .map(toHistoryOrder)
        );
    }

    /**
     * The simulated account, in the `/api/account` field set.
     *
     * `margin` and `frozen` are zero on purpose: nothing is set aside yet, and
     * the store adds all three fields together to get the account total, so a
     * used-margin figure the balance has not been reduced by would inflate the
     * equity the whole panel reports.
     */
    public accountInfo(): PaperAccountInfo {
        const unrealizedTotal = paperState.positions.reduce((sum, p) => {
            const mark = markPrice(p.symbol) ?? new Decimal(p.entryPrice);
            return sum.plus(unrealized(p, mark));
        }, new Decimal(0));

        return {
            available: paperState.balance.toString(),
            margin: "0",
            totalUnrealizedPnL: unrealizedTotal.toString(),
            marginCoin: "USDT",
            frozen: "0",
            transfer: "0",
            bonus: "0",
            // The simulator holds one position per symbol and side, which is
            // hedge mode's shape. Saying so keeps the account panel honest
            // rather than reporting the venue's setting for a venue this
            // account is not on.
            positionMode: "HEDGE",
            crossUnrealizedPNL: unrealizedTotal.toString(),
            isolationUnrealizedPNL: "0",
        };
    }

    /** The balance the calculator sizes against, as a plain string. */
    public balance(): string {
        return paperState.balance.toString();
    }
}

const feed = new PaperAccountFeed();

/**
 * The simulated account's read side while paper mode is on, or `null`.
 *
 * Every account read in the app asks this first and falls through when it
 * answers `null`. One function, one question, one place to look for the
 * answer to "where does account state come from" — the read counterpart to
 * `tradeService.signedRequest`.
 */
export function paperAccountFeed(): PaperAccountFeed | null {
    return paperState.enabled ? feed : null;
}
