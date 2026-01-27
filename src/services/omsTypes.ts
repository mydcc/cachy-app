/*
 * Copyright (C) 2026 MYDCT
 *
 * OMS Types
 */

import type { Decimal } from "decimal.js";

export type OMSOrderStatus = "pending" | "filled" | "cancelled" | "rejected" | "expired";

export interface OMSOrder {
    id: string;
    clientOrderId?: string;
    symbol: string;
    side: "buy" | "sell";
    type: "limit" | "market";
    status: OMSOrderStatus;
    price: Decimal;
    amount: Decimal;
    filledAmount: Decimal;
    avgPrice?: Decimal;
    timestamp: number;
}

export interface OMSPosition {
    symbol: string;
    side: "long" | "short";
    amount: Decimal;
    entryPrice: Decimal;
    unrealizedPnl: Decimal;
    leverage: Decimal;
    marginMode: "cross" | "isolated";
    liquidationPrice?: Decimal;
}
