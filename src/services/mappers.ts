/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { Decimal } from "decimal.js";
import { logger } from "./logger";
import type { OMSOrder, OMSPosition, OMSOrderStatus } from "./omsTypes";
import type { PositionRaw } from "./apiSchemas";

export function mapToOMSPosition(data: any): OMSPosition {
  const isClose = data.event === "CLOSE";
  // Handle both WS data (qty) and API data (qty/size/amount)
  const amount = isClose ? new Decimal(0) : new Decimal(data.qty || data.size || data.amount || 0);

  // Side logic
  let side: "long" | "short" = "long";
  const rawSide = (data.side || data.positionSide || data.holdSide || "").toLowerCase();
  if (rawSide.includes("sell") || rawSide.includes("short")) side = "short";

  return {
    symbol: data.symbol,
    side,
    amount,
    entryPrice: new Decimal(data.averagePrice || data.avgOpenPrice || data.entryPrice || 0),
    unrealizedPnl: new Decimal(data.unrealizedPNL || data.unrealizedPnl || 0),
    leverage: new Decimal(data.leverage || 0),
    marginMode: (data.marginMode || "cross").toLowerCase() as "cross" | "isolated",
    liquidationPrice: (data.liquidationPrice || data.liqPrice)
      ? new Decimal(data.liquidationPrice || data.liqPrice)
      : undefined,
  };
}

export function mapToOMSOrder(data: any): OMSOrder {
  // Hardening: Detect numeric IDs which imply precision loss
  if (typeof data.orderId === 'number') {
    // 2^53 - 1 = 9007199254740991
    if (data.orderId > 9007199254740991) {
        logger.warn("network", `[Mappers] CRITICAL: orderId is number > MAX_SAFE_INTEGER! Precision lost: ${data.orderId}`);
    } else {
        logger.warn("network", `[Mappers] Warning: orderId is number. Ensure safeJsonParse is used upstream: ${data.orderId}`);
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

  const status = statusMap[data.orderStatus] || "pending";

  return {
    id: String(data.orderId),
    symbol: data.symbol,
    side: (data.side || "").toLowerCase() as "buy" | "sell",
    type: (data.type || "").toLowerCase() as "limit" | "market",
    status: status,
    price: new Decimal(data.price || 0),
    amount: new Decimal(data.qty || data.amount || 0),
    filledAmount: new Decimal(data.dealAmount || 0),
    timestamp: Number(data.ctime || Date.now()),
  };
}
