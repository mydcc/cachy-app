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
    private readonly MAX_ORDERS = 500; // Soft limit for finalized orders
    private readonly HARD_LIMIT = 1000; // Hard limit for ALL orders (including active)
    private readonly MAX_POSITIONS = 50;

    public updateOrder(order: OMSOrder) {
        this.orders.set(order.id, order);
        logger.log("market", `[OMS] Order Updated: ${order.id} (${order.status})`);

        if (this.orders.size > this.MAX_ORDERS) {
            this.pruneOrders();
        }

        // Potential integration with a dedicated omsStore later
        // For now, we sync important bits back to tradeState if it's the active symbol
        if (order.symbol === tradeState.symbol) {
            // tradeState.updateCurrentOrder(...) 
        }
    }

    private pruneOrders() {
        // 1. Soft Pruning: Remove only finalized orders
        for (const [id, order] of this.orders) {
            if (this.orders.size <= this.MAX_ORDERS) break;

            if (["filled", "cancelled", "rejected", "expired"].includes(order.status)) {
                this.orders.delete(id);
            }
        }

        // 2. Hard Pruning: If still above HARD_LIMIT, evict oldest orders REGARDLESS of status
        if (this.orders.size > this.HARD_LIMIT) {
            // TRADE-OFF: We are evicting active orders from memory to prevent OOM crash.
            // This creates "zombie orders" (Exchange has them, App doesn't).
            // A crash would be worse as the user would lose control entirely.
            // Future improvement: Attempt to cancel oldest orders before eviction.
            logger.error("market", `[OMS] CRITICAL: Hard Limit exceeded (${this.orders.size}). Forcing eviction of active orders to prevent crash.`);

            for (const [id] of this.orders) {
                if (this.orders.size <= this.HARD_LIMIT) break;
                this.orders.delete(id);
            }
        }

        if (this.orders.size > this.MAX_ORDERS) {
            // Still over soft limit (but under hard limit), means we have many active orders
            logger.warn("market", `[OMS] Order limit exceeded (${this.orders.size}) with active orders.`);
        }
    }

    public updatePosition(position: OMSPosition) {
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
