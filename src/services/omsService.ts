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

    // Safety Limits to prevent memory leaks
    private readonly MAX_ORDERS = 500;
    private readonly MAX_POSITIONS = 50;

    public updateOrder(order: OMSOrder) {
        // Enforce Limit: If map is full and this is a NEW order, try to remove the oldest FINALIZED order.
        if (this.orders.size >= this.MAX_ORDERS && !this.orders.has(order.id)) {
            // Iterating a Map yields entries in insertion order (oldest first)
            for (const [id, existingOrder] of this.orders) {
                // Only evict if the order is in a final state
                if (["filled", "cancelled", "rejected", "expired"].includes(existingOrder.status)) {
                    this.orders.delete(id);
                    break; // Space made, stop
                }
            }

            // If we are still at capacity, it means we have 500 ACTIVE orders.
            // In this case, we MUST NOT evict (safety first). We accept the memory growth.
            if (this.orders.size >= this.MAX_ORDERS) {
                logger.warn("market", `[OMS] Order limit (${this.MAX_ORDERS}) reached with all ACTIVE orders. Expanding memory.`);
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
        const key = position.symbol + ":" + position.side;

        // Enforce Limit: If map is full, try to remove closed positions (amount == 0)
        if (this.positions.size >= this.MAX_POSITIONS && !this.positions.has(key)) {
            for (const [k, p] of this.positions) {
                // Check if position is effectively closed (amount ~ 0)
                if (p.amount.isZero() || p.amount.abs().lt(0.00000001)) {
                    this.positions.delete(k);
                    break;
                }
            }

            if (this.positions.size >= this.MAX_POSITIONS) {
                 logger.warn("market", `[OMS] Position limit (${this.MAX_POSITIONS}) reached with all OPEN positions. Expanding memory.`);
            }
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
