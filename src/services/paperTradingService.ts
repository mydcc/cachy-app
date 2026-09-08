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
 * Paper trading integration — FEAT-0012.
 *
 * Connects the simulator to the rest of the app: the live price feed it fills
 * against, the shared OMS and account stores its positions appear in, and the
 * mode switch.
 *
 * Paper positions reach the UI through the *existing* store shapes. There are
 * no paper-specific components, because a separate display path would mean
 * the paper UI is not the UI being tested.
 */

import { Decimal } from "decimal.js";
import { omsService } from "./omsService";
import {
    paperExchange,
    setPaperBookListener,
    setPaperLeverageFeed,
    setPaperPriceFeed,
} from "./paperExchange";
import { paperAccountFeed } from "./paperAccountFeed";
import { paperJournalService } from "./paperJournalService";
import { paperState, type PaperPosition } from "../stores/paperTrading.svelte";
import { marketState } from "../stores/market.svelte";
import { accountState } from "../stores/account.svelte";
import { tradeState } from "../stores/trade.svelte";
import { logger } from "./logger";
import type { OMSPosition } from "./omsTypes";

/**
 * How often the whole book is marked to market — FEAT-0327.
 *
 * `onPrice` only ever fires for the charted symbol, so a position in anything
 * else never moved. This sweeps every symbol the book holds, which is also
 * what lets a resting order in a symbol the user is not looking at trigger at
 * all.
 */
const TICK_INTERVAL_MS = 1000;

function toOMSPosition(position: PaperPosition, markPrice: Decimal | null): OMSPosition {
    const amount = new Decimal(position.amount);
    const entry = new Decimal(position.entryPrice);
    const mark = markPrice ?? entry;
    const unrealized =
        position.side === "long"
            ? mark.minus(entry).times(amount)
            : entry.minus(mark).times(amount);

    return {
        symbol: position.symbol,
        side: position.side,
        amount,
        entryPrice: entry,
        unrealizedPnl: unrealized,
        leverage: new Decimal(position.leverage),
        marginMode: position.marginMode,
        markPrice: mark,
        realizedPnl: new Decimal(position.realizedPnl),
        positionId: position.positionId,
        lastUpdated: Date.now(),
    };
}

class PaperTradingService {
    private installed = false;
    private tickTimer: ReturnType<typeof setInterval> | null = null;
    /** Symbol:side keys mirrored into the OMS on the last sync. */
    private mirrored = new Set<string>();

    /**
     * Points the simulator at the live feed and starts mirroring the paper
     * book into the shared stores. Safe to call once at startup regardless of
     * which mode is active — nothing happens until paper mode is on.
     */
    public install(): void {
        if (this.installed) return;
        this.installed = true;

        // The live feed, not a synthetic one: a simulation running on made-up
        // prices proves nothing about the live path.
        setPaperPriceFeed((symbol) => {
            const price = marketState.data[symbol]?.lastPrice ?? null;
            return price instanceof Decimal ? price : null;
        });

        // The place-order payload carries no leverage — it is account state on
        // the venue, set separately — so the simulator is told the leverage the
        // trader is actually working at rather than recording every position
        // as unlevered.
        setPaperLeverageFeed(() => {
            const raw = tradeState.leverage;
            try {
                const chosen = raw === null || raw === undefined ? null : new Decimal(String(raw));
                if (chosen !== null && chosen.isFinite() && chosen.gt(0)) return chosen;
            } catch {
                // Falls through to the venue's own value below.
            }
            const remote = tradeState.remoteLeverage;
            return remote instanceof Decimal && remote.gt(0) ? remote : null;
        });

        // A fill reaches the stores on the fill, not on the next price tick.
        // Without this an order placed on a quiet symbol stayed invisible for
        // as long as the market stayed quiet — which is exactly when someone
        // looks hardest for the order they just placed.
        setPaperBookListener(() => {
            this.syncToStores();
            paperJournalService.reconcile();
        });

        if (paperState.enabled) {
            this.startTicking();
            this.syncToStores();
            paperJournalService.reconcile();
        }
    }

    /**
     * Marks the whole book to market on a timer.
     *
     * `onPrice` is driven from the charted symbol alone, so this is what makes
     * a second position — and a resting order in a symbol nobody is watching —
     * behave like a position at a venue rather than one that only moves while
     * you look at it.
     */
    private startTicking(): void {
        if (this.tickTimer !== null) return;
        this.tickTimer = setInterval(() => this.tickBook(), TICK_INTERVAL_MS);
    }

    private stopTicking(): void {
        if (this.tickTimer === null) return;
        clearInterval(this.tickTimer);
        this.tickTimer = null;
    }

    /** Test and teardown seam: stops the mark-to-market timer. */
    public destroy(): void {
        this.stopTicking();
        setPaperBookListener(null);
        this.installed = false;
    }

    private tickBook(): void {
        if (!paperState.enabled) return;
        const symbols = new Set<string>([
            ...paperState.positions.map((p) => p.symbol),
            ...paperState.orders.map((o) => o.symbol),
        ]);
        if (symbols.size === 0) return;

        for (const symbol of symbols) {
            const price = marketState.data[symbol]?.lastPrice;
            if (!(price instanceof Decimal) || price.lte(0)) continue;
            try {
                paperExchange.settleRestingOrders(symbol, price);
            } catch (e) {
                logger.debug("market", "[Paper] Resting-order settlement failed", e);
            }
        }
        this.syncToStores();
    }

    /**
     * Called on each price update while paper mode is on: fills any resting
     * order the feed has crossed, then refreshes the shared stores so the
     * existing UI sees the result.
     */
    public onPrice(symbol: string, price: Decimal): void {
        if (!paperState.enabled) return;
        try {
            paperExchange.settleRestingOrders(symbol, price);
        } catch (e) {
            logger.debug("market", "[Paper] Resting-order settlement failed", e);
        }
        this.syncToStores();
    }

    /**
     * Switches modes.
     *
     * State never carries across: the shared OMS and account stores are wiped
     * on the way in *and* on the way out. A simulated position lingering in a
     * live account — or the reverse — is the failure this whole feature exists
     * to avoid, and it is cheaper to re-fetch real state than to reconcile it.
     */
    public setEnabled(on: boolean): void {
        if (paperState.enabled === on) return;

        omsService.reset();
        accountState.reset();
        this.mirrored.clear();
        paperState.setEnabled(on);

        if (on) {
            this.startTicking();
            this.syncToStores();
            paperJournalService.reconcile();
        } else {
            // Nothing to mark to market, and a timer that keeps sweeping a
            // book nobody is trading is the kind of thing that survives into
            // production unnoticed.
            this.stopTicking();
        }
        logger.log("market", `[Paper] Mode switched to ${on ? "paper" : "live"}`);
    }

    /** Wipes the simulated book back to the configured starting balance. */
    public resetBook(): void {
        paperState.resetBook();
        if (paperState.enabled) {
            omsService.reset();
            accountState.reset();
            this.mirrored.clear();
            this.syncToStores();
        }
    }

    /**
     * Mirrors the paper book into the stores the real path writes to, in the
     * same shapes, so every existing component renders it unchanged.
     *
     * FEAT-0327 added the two arrays the Market Activity panel actually
     * renders. Before that this wrote the OMS and the balance only, so the
     * balance moved when a simulated order filled while the position it paid
     * for was nowhere on screen — and with no card on screen there was no
     * close button, no TP/SL dialog and no way to follow the trade at all.
     */
    public syncToStores(): void {
        const feed = paperAccountFeed();
        if (feed === null) return;

        // The two arrays the panel renders, through the same hydration the
        // REST snapshots use — so `PositionsSidebar` needs no notion of which
        // mode produced them, and neither does anything downstream of it.
        accountState.hydratePositions(feed.positions());
        accountState.hydrateOpenOrders(feed.pendingOrders());

        const account = feed.accountInfo();
        accountState.hydrateBalance({
            available: account.available,
            margin: account.margin,
            frozen: account.frozen,
        });
        accountState.positionMode = account.positionMode;

        this.mirrorToOms();
    }

    /**
     * Keeps the OMS's view of the book in step, removals included.
     *
     * The FEAT-0011 gate reads `omsService.getPositions()` to verify a close
     * against what the trader was shown. `updatePosition` can only add or
     * overwrite, so without the removal pass a closed simulated position would
     * stay visible to the gate and a second close of it would verify against a
     * position that no longer exists.
     */
    private mirrorToOms(): void {
        const live = new Set<string>();
        for (const position of paperState.positions) {
            const mark = marketState.data[position.symbol]?.lastPrice ?? null;
            omsService.updatePosition(
                toOMSPosition(position, mark instanceof Decimal ? mark : null),
            );
            live.add(`${position.symbol}:${position.side}`);
        }

        for (const key of this.mirrored) {
            if (live.has(key)) continue;
            const separator = key.lastIndexOf(":");
            omsService.removePosition(
                key.slice(0, separator),
                key.slice(separator + 1) as "long" | "short",
            );
        }
        this.mirrored = live;
    }
}

export const paperTradingService = new PaperTradingService();

// HMR: the mark-to-market timer and the book listener both outlive a module
// swap otherwise, leaving two of each sweeping the same book.
if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        paperTradingService.destroy();
    });
}
