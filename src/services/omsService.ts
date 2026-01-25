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
        // Enforce limit: Prune oldest finalized orders first, then any oldest
        if (this.orders.size >= this.MAX_ORDERS && !this.orders.has(order.id)) {
            // optimized simple FIFO for now to prevent O(n) scan
            const firstKey = this.orders.keys().next().value;
            if (firstKey) this.orders.delete(firstKey);
        }

        this.orders.set(order.id, order);
        logger.log("market", `[OMS] Order Updated: ${order.id} (${order.status})`);

        // Potential integration with a dedicated omsStore later
        // For now, we sync important bits back to tradeState if it's the active symbol
        if (order.symbol === tradeState.symbol) {
            // tradeState.updateCurrentOrder(...) 
        }
    }

    public updatePosition(position: OMSPosition) {
        const key = position.symbol + ":" + position.side;

        // Enforce limit
        if (this.positions.size >= this.MAX_POSITIONS && !this.positions.has(key)) {
            const firstKey = this.positions.keys().next().value;
            if (firstKey) this.positions.delete(firstKey);
        }

        this.positions.set(key, position);
        logger.log("market", `[OMS] Position Updated: ${position.symbol} ${position.side}`);
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
