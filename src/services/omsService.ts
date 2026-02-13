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

import { tradeState } from "../stores/trade.svelte";
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
        // Protect recent orders from being pruned immediately (UI needs to see them)
        const PRESERVE_LATEST = 20;

        // Note: Map.keys() respects insertion order.
        // The first keys are the oldest inserted.

        // 1. Safe Prune: Remove oldest finalized orders
        // We iterate from the start (Oldest)
        for (const [id, order] of this.orders) {
            if (this.orders.size <= this.MAX_ORDERS && !forceOne) break;

            // Check if finalized
            if (["filled", "cancelled", "rejected", "expired"].includes(order.status)) {
                 this.orders.delete(id);
                 if (forceOne) return; // Mission accomplished
            }
        }

        // 2. Force Prune: If still full (or no finalized orders found to delete),
        // delete the ABSOLUTE OLDEST, even if active (unless we are inside the protected buffer)
        // This is a trade-off: Dropping an active order from OMS is better than crashing or rejecting new ones.
        if (this.orders.size > this.MAX_ORDERS || forceOne) {
             const keys = this.orders.keys();
             const oldestId = keys.next().value;
             if (oldestId) {
                 this.orders.delete(oldestId);
                 logger.warn("market", `[OMS] Ring Buffer Eviction: Removed oldest order ${oldestId}`);
             }
        }
    }

    public updatePosition(position: OMSPosition) {
        // Enforce freshness timestamp
        if (!position.lastUpdated) {
            position.lastUpdated = Date.now();
        }
        this.positions.set(position.symbol + ":" + position.side, position);
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
