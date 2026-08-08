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
 * Copyright (C) 2026 MYDCT
 *
 * Order Management System (OMS)
 * Orchestrates order state across providers and syncs with UI.
 */

import type { OMSOrder, OMSPosition } from "./omsTypes";
import { logger } from "./logger";

class OrderManagementSystem {
    private orders = new Map<string, OMSOrder>();
    private positions = new Map<string, OMSPosition>();
    private readonly MAX_ORDERS = 2000;
    private readonly MAX_POSITIONS = 50;
    private watchdogInterval: ReturnType<typeof setInterval> | null = null;

    constructor() {
        // Watchdog: Clean up optimistic orders that are stuck (Ghost Orders)
        // Runs every 5 seconds, removes orders older than 30 seconds
        if (typeof window !== "undefined") {
            this.watchdogInterval = setInterval(() => {
                this.removeOrphanedOptimistic(30000);
            }, 5000);
        }
    }

    public destroy() {
        if (this.watchdogInterval) {
            clearInterval(this.watchdogInterval);
            this.watchdogInterval = null;
        }
    }

    public reset() {
        this.orders.clear();
        this.positions.clear();
        logger.log("market", "[OMS] State Reset");
    }

    public updateOrder(order: OMSOrder) {
        const isKnown = this.orders.has(order.id);

        // Ring Buffer Logic:
        // If we are at capacity and this is a NEW order, we must make space.
        // We do NOT reject new orders. We evict the oldest ones.
        if (!isKnown && this.orders.size >= this.MAX_ORDERS) {
            this.pruneOrders(true); // Force prune one item
        }

        this.orders.set(order.id, order);
        logger.log("market", `[OMS] Order Updated: ${order.id} (${order.status})`);
    }

    public addOptimisticOrder(order: OMSOrder) {
        order._isOptimistic = true;
        this.orders.set(order.id, order);
        logger.log("market", `[OMS] Optimistic Order Added: ${order.id}`);
    }

    public removeOrphanedOptimistic(thresholdMs: number) {
        const now = Date.now();
        for (const [id, order] of this.orders) {
            if (order._isOptimistic && (now - order.timestamp) > thresholdMs) {
                this.orders.delete(id);
                logger.warn("market", `[OMS] Removed orphaned optimistic order: ${id}`);
            }
        }
    }

    private pruneOrders(forceOne = false) {
        const PRESERVE_LATEST = 20;

        // 1. Safe Prune: Remove oldest finalized orders
        for (const [id, order] of this.orders) {
            if (this.orders.size <= this.MAX_ORDERS && !forceOne) break;
            if (["filled", "cancelled", "rejected", "expired"].includes(order.status)) {
                this.orders.delete(id);
                if (forceOne) return;
            }
        }

        // 2. Force Prune: Evict oldest order outside PRESERVE_LATEST protection window.
        // Strategy: Always keep the most recently inserted PRESERVE_LATEST orders.
        // Only delete older ones, never delete a just-inserted order.
        if (this.orders.size > this.MAX_ORDERS || forceOne) {
            const allOrderEntries = Array.from(this.orders.entries());
            // Entries beyond PRESERVE_LATEST (oldest ones) are candidates for deletion
            const oldersOutsideBuffer = allOrderEntries.slice(
              0,
              Math.max(0, allOrderEntries.length - PRESERVE_LATEST),
            );

            if (oldersOutsideBuffer.length > 0) {
                // Find the oldest order outside the protection window
                const oldestOutsideBuffer = oldersOutsideBuffer[0];
                if (oldestOutsideBuffer) {
                    const [id] = oldestOutsideBuffer;
                    this.orders.delete(id);
                    logger.warn(
                      "market",
                      `[OMS] Ring Buffer Eviction: Removed order ${id} (outside PRESERVE_LATEST)`,
                    );
                    if (forceOne) return;
                }
            }
            // If all remaining orders are in PRESERVE_LATEST, skip force prune
            // (better to keep them than to evict a just-inserted order)
        }
    }

    public updatePosition(position: OMSPosition) {
        // Enforce freshness timestamp
        if (!position.lastUpdated) {
            position.lastUpdated = Date.now();
        }
        const key = position.symbol + ":" + position.side;
        const existing = this.positions.get(key);
        // Bitunix's WS position channel doesn't repeat positionId/positionMode
        // on every push (e.g. a PnL-only UPDATE) — mapToOMSPosition() then maps
        // them to undefined, and since this used to be a blind overwrite, that
        // wiped an already-known positionId moments before a close, resetting
        // `lastUpdated` in the process so ensurePositionFreshness() saw the
        // corrupted entry as "fresh" and never refetched it. Bitunix's
        // place_order requires positionId unconditionally to close (BUG-0063),
        // so losing it here reproduces the same "must not be null" rejection
        // even after that fix (BUG-0064). Falling back to the previous value
        // mirrors accountState.updatePositionFromWs's existing merge pattern.
        const merged: OMSPosition = {
            ...position,
            positionId: position.positionId ?? existing?.positionId,
            positionMode: position.positionMode ?? existing?.positionMode,
        };
        this.positions.set(key, merged);
        logger.log("market", `[OMS] Position Updated: ${position.symbol} ${position.side}`);

        if (this.positions.size > this.MAX_POSITIONS) {
            // Prune positions with 0 amount (closed)
            for (const [key, pos] of this.positions) {
                if (this.positions.size <= this.MAX_POSITIONS) break;
                if (pos.amount.isZero()) {
                    this.positions.delete(key);
                }
            }
        }
    }

    public removeOrder(id: string) {
        this.orders.delete(id);
        logger.log("market", `[OMS] Order Removed: ${id}`);
    }

    public getOrder(id: string): OMSOrder | undefined {
        return this.orders.get(id);
    }

    public getAllOrders(): OMSOrder[] {
        return Array.from(this.orders.values());
    }

    public getPositions(): OMSPosition[] {
        return Array.from(this.positions.values());
    }
}

export const omsService = new OrderManagementSystem();

if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        omsService.destroy();
    });
}
