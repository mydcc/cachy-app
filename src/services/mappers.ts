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
import { logger } from "./logger";
import { parseDecimal } from "../utils/utils";
import type { OMSOrder, OMSPosition, OMSOrderSide, OMSOrderStatus } from "./omsTypes";

/**
 * `parseDecimal`, for the "field absent means omit it entirely" call sites
 * below (e.g. `markPrice` on a position where the exchange sent none) —
 * `parseDecimal` itself always falls back to `Decimal(0)`, which is right
 * for a price/amount but wrong for an optional field consumers expect to be
 * `undefined` when absent.
 */
function parseDecimalOrUndefined(value: unknown): Decimal | undefined {
    if (value === undefined || value === null || value === "") return undefined;
    return parseDecimal(value as string | number | Decimal);
}

/**
 * Recomputes unrealized PnL from a live mark price instead of trusting the
 * account-channel snapshot. Bitunix's WS position channel only pushes on
 * order lifecycle events — create/fill/cancel (docs/bitunix-api/
 * 08_websocket.md's Position Channel) — not on every price tick, so
 * `unrealizedPnl` read straight off the account store goes stale between
 * those events even though markPrice (fed continuously by the public
 * `price` channel) keeps updating. Reported by a user seeing PnL only
 * refresh on a full page reload.
 */
export function calculateLiveUnrealizedPnl(
    side: "long" | "short",
    entryPrice: Decimal,
    markPrice: Decimal,
    size: Decimal,
): Decimal {
    const priceDiff = side === "long" ? markPrice.minus(entryPrice) : entryPrice.minus(markPrice);
    return priceDiff.times(size);
}

/**
 * Maps raw API/WS data to a standardized OMSPosition.
 * Handles different field names (API vs WS) and ensures Decimal precision.
 */
// Bitunix/Bitget's REST and WS payloads use different field names for the
// same value (avgOpenPrice vs averagePrice, qty vs size vs amount, ...) —
// the function's job is duck-typing across all of them, matching
// BitunixWSMessage.data's own documented reasoning (passes 68/73).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapToOMSPosition(data: any): OMSPosition {
    const isClose = data.event === "CLOSE";
    // If event is CLOSE, the position is effectively closed (qty 0).
    const amount = isClose ? new Decimal(0) : parseDecimal(data.qty || data.size || data.amount);

    // Side normalization
    let side: "long" | "short" = "long";
    const rawSide = (data.side || data.positionSide || data.holdSide || "").toLowerCase();
    if (rawSide.includes("sell") || rawSide.includes("short")) {
        side = "short";
    }

    // Price priority: avgOpenPrice (API/WS) > entryPrice (API fallback)
    const entryPrice = parseDecimal(data.avgOpenPrice || data.averagePrice || data.entryPrice);
    const upnl = parseDecimal(data.unrealizedPNL || data.unrealizedPnl);
    const lev = parseDecimal(data.leverage);
    const rawLiq = data.liquidationPrice || data.liqPrice;
    const liq = rawLiq ? parseDecimalOrUndefined(rawLiq) : undefined;

    return {
        symbol: data.symbol || "",
        side,
        amount,
        entryPrice,
        unrealizedPnl: upnl,
        leverage: lev,
        marginMode: (data.marginMode || "cross").toLowerCase() as "cross" | "isolated",
        liquidationPrice: liq,
        // Hardening: Extract real values from API instead of using Decimal(0) placeholder.
        // Use undefined when the field is absent — consumers already handle optional fields.
        margin: parseDecimalOrUndefined(data.margin || data.isolatedMargin || data.crossMargin),
        markPrice: parseDecimalOrUndefined(data.markPrice),
        size: amount,
        lastUpdated: Date.now(),
        positionId: data.positionId !== undefined ? String(data.positionId) : undefined,
        positionMode: data.positionMode
            ? (String(data.positionMode).toUpperCase() === "HEDGE" ? "hedge" : "one_way")
            : undefined,
    };
}

/**
 * Maps raw API/WS data to a standardized OMSOrder.
 * Handles numeric ID conversion warnings.
 */
// Same reasoning as mapToOMSPosition above: duck-types across differently
// -shaped Bitunix/Bitget REST and WS order payloads.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapToOMSOrder(data: any): OMSOrder {
    // Hardening: Detect numeric IDs which imply precision loss
    // Note: This check happens AFTER JSON.parse, so 19-digit numbers might already be corrupted.
    // However, it catches smaller unsafe integers or accidental numeric casts.
    if (typeof data.orderId === 'number') {
        // Safe limit is 2^53 - 1
        if (data.orderId > Number.MAX_SAFE_INTEGER) {
            logger.warn("market", `[Mapper] CRITICAL: Precision Loss detected for orderId: ${data.orderId}. Ensure safeJsonParse is used upstream.`);
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
        price: parseDecimal(data.price),
        amount: parseDecimal(data.qty || data.amount),
        filledAmount: parseDecimal(data.dealAmount || data.filledQty),
        timestamp: Number(data.ctime || data.timestamp || Date.now()), // audit: safe — epoch-ms timestamp, not a financial value
    };
}
