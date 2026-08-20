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
 * Pending TP/SL plans — FEAT-0057.
 *
 * Showing a position's stop and target on its own card was the last open
 * acceptance criterion of that item, and it was left open for a concrete
 * reason: `TpSlList` fetches plans from a dedicated endpoint
 * (`tradeService.fetchTpSlOrders()`), not from `accountState.openOrders`, so
 * "just render what we already have" was never available. The choice was
 * between an eager fetch the card does not otherwise need, and reusing the
 * list's on-demand fetch some other way.
 *
 * This is that other way: one cache both consumers read. The fetch happens
 * when plans are about to be *displayed* — which is when the card renders or
 * the TP/SL tab opens, whichever comes first — and the result serves both.
 * Opening the tab after looking at the positions list now costs nothing,
 * where before it always refetched.
 *
 * The honest cost: a trader who keeps the Positions tab open and never looks
 * at the TP/SL tab now makes requests they previously did not. `MAX_AGE_MS`
 * and the in-flight dedupe below are what keep that bounded, and the fetch is
 * skipped entirely when there are no positions to annotate.
 *
 * Only *pending* plans live here. The history view is TpSlList's own concern:
 * a closed plan can never belong to an open position, so the card has no use
 * for it and caching it would buy nothing.
 */

import { activeExchange, type TpSlOrder } from "../services/exchange";
import { logger } from "../services/logger";

/**
 * How long a fetched set is treated as current. Plans change when the user
 * edits them — which goes through this store and invalidates it — or when
 * one triggers, which is an event the position list reflects anyway.
 */
export const MAX_AGE_MS = 30_000;

export interface SymbolPlans {
    /** Take-profit plan, if one is set. */
    profit?: TpSlOrder;
    /** Stop-loss plan, if one is set. */
    loss?: TpSlOrder;
}

function planTypeOf(order: TpSlOrder): "PROFIT" | "LOSS" | null {
    const raw = String(order.planType ?? "").toUpperCase();
    if (raw.includes("PROFIT")) return "PROFIT";
    if (raw.includes("LOSS")) return "LOSS";
    return null;
}

class TpSlManager {
    private _orders = $state<TpSlOrder[]>([]);
    private _loading = $state(false);
    private _error = $state<string | null>(null);
    private _loadedAt: number | null = null;
    /** De-dupes concurrent callers so two consumers cannot double-fetch. */
    private inFlight: Promise<void> | null = null;

    get orders(): readonly TpSlOrder[] {
        return this._orders;
    }

    get loading(): boolean {
        return this._loading;
    }

    get error(): string | null {
        return this._error;
    }

    get loadedAt(): number | null {
        return this._loadedAt;
    }

    /**
     * The plans attached to one symbol. Returns an empty object rather than
     * null so a caller can destructure it without a guard — "no plans" and
     * "not loaded yet" look the same to a card, and both mean "show nothing".
     */
    public plansFor(symbol: string): SymbolPlans {
        const plans: SymbolPlans = {};
        for (const order of this._orders) {
            if (order.symbol !== symbol) continue;
            const type = planTypeOf(order);
            if (type === "PROFIT" && !plans.profit) plans.profit = order;
            if (type === "LOSS" && !plans.loss) plans.loss = order;
        }
        return plans;
    }

    public hasPlansFor(symbol: string): boolean {
        return this._orders.some((o) => o.symbol === symbol);
    }

    /**
     * Fetches if the cache is stale, and does nothing if it is not. Safe to
     * call from a render path: concurrent calls share one request, and a
     * failure is recorded rather than thrown — a position card must still
     * render when the TP/SL endpoint is unavailable.
     */
    public async ensureFresh(now = Date.now()): Promise<void> {
        if (this.inFlight) return this.inFlight;
        if (this._loadedAt !== null && now - this._loadedAt < MAX_AGE_MS) return;

        this.inFlight = (async () => {
            this._loading = true;
            try {
                this._orders = await activeExchange().trading.fetchTpSlOrders("pending");
                // Stamped with the caller's clock, not `Date.now()`, so the
                // staleness check above and this always measure the same
                // thing. Dating the window from the request rather than the
                // response also errs short, which is the right direction for
                // a cache of live stop levels.
                this._loadedAt = now;
                this._error = null;
            } catch (e) {
                this._error = e instanceof Error ? e.message : String(e);
                logger.debug("api", "[TpSl] Fetch failed", e);
            } finally {
                this._loading = false;
                this.inFlight = null;
            }
        })();

        return this.inFlight;
    }

    /**
     * Marks the cache stale. Call after anything that changes plans — an
     * edit, a cancel, a position closing — so the next read refetches
     * instead of showing a plan that no longer exists.
     */
    public invalidate(): void {
        this._loadedAt = null;
    }

    /** Drops everything. Used when the account or exchange changes. */
    public reset(): void {
        this._orders = [];
        this._loadedAt = null;
        this._error = null;
    }
}

export const tpSlState = new TpSlManager();
