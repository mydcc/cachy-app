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
import { paperExchange, setPaperPriceFeed } from "./paperExchange";
import { paperState, type PaperPosition } from "../stores/paperTrading.svelte";
import { marketState } from "../stores/market.svelte";
import { accountState } from "../stores/account.svelte";
import { logger } from "./logger";
import type { OMSPosition } from "./omsTypes";

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

        if (paperState.enabled) this.syncToStores();
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
        paperState.setEnabled(on);

        if (on) {
            this.syncToStores();
        }
        logger.log("market", `[Paper] Mode switched to ${on ? "paper" : "live"}`);
    }

    /** Wipes the simulated book back to the configured starting balance. */
    public resetBook(): void {
        paperState.resetBook();
        if (paperState.enabled) {
            omsService.reset();
            accountState.reset();
            this.syncToStores();
        }
    }

    /**
     * Mirrors the paper book into the stores the real path writes to, in the
     * same shapes, so every existing component renders it unchanged.
     */
    public syncToStores(): void {
        if (!paperState.enabled) return;

        for (const position of paperState.positions) {
            const mark = marketState.data[position.symbol]?.lastPrice ?? null;
            omsService.updatePosition(
                toOMSPosition(position, mark instanceof Decimal ? mark : null),
            );
        }

        // Through the same hydration path a REST balance poll uses, so the
        // account UI cannot tell the difference — which is the point.
        accountState.hydrateBalance({
            available: paperState.balance.toString(),
            margin: "0",
            frozen: "0",
        });
    }
}

export const paperTradingService = new PaperTradingService();
