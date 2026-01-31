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
 * Copyright (C) 2026 MYDCT
 *
 * OMS Types
 */

import type { Decimal } from "decimal.js";

export type OMSOrderStatus = "pending" | "filled" | "cancelled" | "rejected" | "expired";
export type OMSOrderSide = "buy" | "sell";

export interface OMSOrder {
    id: string;
    clientOrderId?: string;
    symbol: string;
    side: OMSOrderSide;
    type: "limit" | "market";
    status: OMSOrderStatus;
    price: Decimal;
    amount: Decimal;
    filledAmount: Decimal;
    avgPrice?: Decimal;
    timestamp: number;
    _isOptimistic?: boolean;
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
