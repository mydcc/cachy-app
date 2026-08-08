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
    _isUnconfirmed?: boolean; // Risk management: Order state unknown (Two Generals)
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
    margin?: Decimal; // Hardening: Ensure margin is optional but typed
    markPrice?: Decimal; // Hardening: Ensure markPrice is optional but typed
    size?: Decimal; // Hardening
    lastUpdated?: number; // Freshness check
    // Bitunix-only, REST snapshot ("Get Pending Positions") — absent for
    // Bitget, and possibly stale relative to a fresh WS position push (the
    // WS position channel never sends marginRate; see account.svelte.ts).
    marginRate?: Decimal;
    // Cumulative realized PnL for the position while it stays open (fees/
    // funding excluded) — live via WS on Bitunix, REST-snapshot-only
    // elsewhere.
    realizedPnl?: Decimal;
    // Needed to close a position correctly (BUG-0062): Bitunix's place_order
    // requires positionId whenever tradeSide="CLOSE", and tradeSide itself
    // is required in HEDGE mode — closePosition()/flashClosePosition() use
    // positionMode to decide which order shape to send.
    positionId?: string;
    positionMode?: "one_way" | "hedge";
}
