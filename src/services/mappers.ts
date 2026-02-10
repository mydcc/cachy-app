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
 * Mappers Service
 * Centralizes data transformation logic for OMS entities.
 */

import { Decimal } from "decimal.js";
import type { OMSOrder, OMSPosition, OMSOrderSide, OMSOrderStatus } from "./omsTypes";

// Helper for safe Decimal conversion
function safeDecimal(val: any): Decimal {
    if (!val) return new Decimal(0);
    if (val instanceof Decimal) return val;
    if (typeof val === 'number' || (typeof val === 'string' && val.trim() !== '')) {
        try { return new Decimal(val); } catch { return new Decimal(0); }
    }
    return new Decimal(0);
}

/**
 * Maps raw API/WS data to a standardized OMSPosition.
 * Handles different field names (API vs WS) and ensures Decimal precision.
 */
export function mapToOMSPosition(data: any): OMSPosition {
    const isClose = data.event === "CLOSE";
    // If event is CLOSE, the position is effectively closed (qty 0).
    const amount = isClose ? new Decimal(0) : safeDecimal(data.qty || data.size || data.amount);

    // Side normalization
    let side: "long" | "short" = "long";
    const rawSide = (data.side || data.positionSide || data.holdSide || "").toLowerCase();
    if (rawSide.includes("sell") || rawSide.includes("short")) {
        side = "short";
    }

    // Price priority: avgOpenPrice (API/WS) > entryPrice (API fallback)
    // Use safeDecimal to handle potentially malformed inputs (e.g. objects) from fallback schema
    const entryPrice = safeDecimal(data.avgOpenPrice || data.averagePrice || data.entryPrice);
    const upnl = safeDecimal(data.unrealizedPNL || data.unrealizedPnl);
    const lev = safeDecimal(data.leverage);
    const liq = (data.liquidationPrice || data.liqPrice)
        ? safeDecimal(data.liquidationPrice || data.liqPrice)
        : undefined;

    return {
        symbol: data.symbol || "",
        side,
        amount,
        entryPrice,
        unrealizedPnl: upnl,
        leverage: lev,
        marginMode: (data.marginMode || "cross").toLowerCase() as "cross" | "isolated",
        liquidationPrice: liq,
        margin: new Decimal(0), // Placeholder as raw data often lacks this explicitly
        markPrice: new Decimal(0), // Placeholder
        size: amount
    };
}

/**
 * Maps raw API/WS data to a standardized OMSOrder.
 * Handles numeric ID conversion warnings.
 */
export function mapToOMSOrder(data: any): OMSOrder {
    // Hardening: Detect numeric IDs which imply precision loss
    // Note: This check happens AFTER JSON.parse, so 19-digit numbers might already be corrupted.
    // However, it catches smaller unsafe integers or accidental numeric casts.
    if (typeof data.orderId === 'number') {
        // Safe limit is 2^53 - 1
        if (data.orderId > Number.MAX_SAFE_INTEGER) {
            // We can't log here easily without importing logger,
            // but the value is likely already corrupted.
            // Ideally logger is imported, but to keep mappers pure/testable we skip side effects
            // or we could accept an optional logger?
            // For now, we just proceed with string conversion.
        }
    }

    const statusMap: Record<string, OMSOrderStatus> = {
        NEW: "pending",
        PARTIALLY_FILLED: "pending",
        FILLED: "filled",
        CANCELED: "cancelled",
        CANCELLED: "cancelled",
        REJECTED: "rejected",
        EXPIRED: "expired",
    };

    const rawStatus = (data.orderStatus || data.status || "").toUpperCase();
    const status = statusMap[rawStatus] || "pending";

    // Side normalization
    const rawSide = (data.side || "").toLowerCase();
    const side: OMSOrderSide = (rawSide.includes("sell") || rawSide.includes("short")) ? "sell" : "buy";

    return {
        id: String(data.orderId || ""),
        symbol: data.symbol || "",
        side,
        type: (data.type || "").toLowerCase() as "limit" | "market",
        status: status,
        price: new Decimal(data.price || 0),
        amount: new Decimal(data.qty || data.amount || 0),
        filledAmount: new Decimal(data.dealAmount || data.filledQty || 0),
        timestamp: Number(data.ctime || data.timestamp || Date.now()),
    };
}
