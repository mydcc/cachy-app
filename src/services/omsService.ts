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
        // If we have an optimistic order with the same clientOrderId, remove it
        if (order.clientOrderId) {
            for (const [id, existing] of this.orders) {
                if (existing._isOptimistic && existing.clientOrderId === order.clientOrderId) {
                    this.orders.delete(id);
                    logger.log("market", `[OMS] Optimistic Order Reconciled: ${id} -> ${order.id}`);
                }
            }
        }

        this.orders.set(order.id, order);
        logger.log("market", `[OMS] Order Updated: ${order.id} (${order.status})`);

        if (this.orders.size > this.MAX_ORDERS) {
            this.pruneOrders();
        }
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
