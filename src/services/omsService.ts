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

    public updateOrder(order: OMSOrder) {
        // Prevent memory leak by capping map size
        if (this.orders.size >= this.MAX_ORDERS && !this.orders.has(order.id)) {
            // CRITICAL FIX: Only evict finalized orders. Never evict open orders.
            let keyToRemove: string | null = null;
            for (const [key, val] of this.orders) {
                if (val.status === 'filled' || val.status === 'cancelled') {
                    keyToRemove = key;
                    break; // Evict oldest finalized order (Map iterates in insertion order)
                }
            }

            if (keyToRemove) {
                this.orders.delete(keyToRemove);
            } else {
                logger.warn("market", `[OMS] Capacity reached (${this.MAX_ORDERS}) but all orders are active. Cannot prune.`);
                // We allow it to grow beyond limit slightly rather than losing active state
            }
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
        this.positions.set(position.symbol + ":" + position.side, position);
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
