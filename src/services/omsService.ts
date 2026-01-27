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
    private readonly MAX_ORDERS = 500;
    private readonly MAX_POSITIONS = 50;

    public updateOrder(order: OMSOrder) {
        // Hardening: Prevent memory attacks by capping active orders
        if (this.orders.size >= this.MAX_ORDERS && !this.orders.has(order.id)) {
             // If we are at limit, try to prune first
             this.pruneOrders();
             if (this.orders.size >= this.MAX_ORDERS) {
                 logger.error("market", `[OMS] Order limit (${this.MAX_ORDERS}) hit. Rejecting new order: ${order.id}`);
                 return; // Reject update to protect memory
             }
        }

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
        // Iterate insertion order (oldest first in Map)
        for (const [id, order] of this.orders) {
            if (this.orders.size <= this.MAX_ORDERS) break;

            // Only remove finalized orders
            if (["filled", "cancelled", "rejected", "expired"].includes(order.status)) {
                this.orders.delete(id);
            }
        }

        if (this.orders.size > this.MAX_ORDERS) {
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
