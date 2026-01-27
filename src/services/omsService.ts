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
    private readonly MAX_ORDERS = 1000;
    private readonly MAX_POSITIONS = 50;

    public updateOrder(order: OMSOrder) {
        const isKnown = this.orders.has(order.id);
        const isFinalized = ["filled", "cancelled", "rejected", "expired"].includes(order.status);

        // Hardening: Prevent memory attacks by capping active orders
        if (!isKnown && this.orders.size >= this.MAX_ORDERS) {
            // If we are at limit, try to prune first
            this.pruneOrders();

            if (this.orders.size >= this.MAX_ORDERS) {
                if (isFinalized) {
                    // CRITICAL FIX: Allow finalized orders to bypass limit temporarily to ensure UI sync
                    // We will trigger prune again after insertion.
                    // This prevents "Phantom Orders" where a fill event is rejected because of full buffer.
                    logger.warn("market", `[OMS] Order limit hit, but accepting FINALIZED order: ${order.id}`);
                } else {
                    logger.error("market", `[OMS] Order limit (${this.MAX_ORDERS}) hit. Rejecting new order: ${order.id}`);
                    return; // Reject update to protect memory
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
        // Protect recent orders from being pruned immediately (UI needs to see them)
        const PRESERVE_LATEST = 10;

        // Convert to array to control iteration range
        // Note: Map.keys() respects insertion order
        const allKeys = Array.from(this.orders.keys());

        // 1. Safe Prune: Remove oldest finalized orders first (ignoring the protected latest buffer)
        // We only check orders that are OLDER than the preservation buffer
        const pruneCandidates = allKeys.slice(0, Math.max(0, allKeys.length - PRESERVE_LATEST));

        for (const id of pruneCandidates) {
            if (this.orders.size <= this.MAX_ORDERS) break;
            const order = this.orders.get(id);
            if (order && ["filled", "cancelled", "rejected", "expired"].includes(order.status)) {
                this.orders.delete(id);
            }
        }

        // 2. Emergency Prune: If still over limit, remove oldest orders regardless of status
        // This ensures new updates (inserted at end) are preserved while sacrificing oldest history.
        if (this.orders.size > this.MAX_ORDERS) {
            logger.warn("market", `[OMS] Emergency Prune: Dropping oldest orders to maintain limit.`);
            // In emergency, we iterate from the start (oldest) and delete until we fit.
            // We use the iterator directly to avoid another array copy
            for (const [id] of this.orders) {
                if (this.orders.size <= this.MAX_ORDERS) break;
                this.orders.delete(id);
            }
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
