/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

export const OrderType = {
    LIMIT: "LIMIT",
    MARKET: "MARKET",
    STOP_LIMIT: "STOP_LIMIT",
    STOP_MARKET: "STOP_MARKET",
    TRAILING_STOP_MARKET: "TRAILING_STOP_MARKET",
    LIQUIDATION: "LIQUIDATION"
} as const;

export type OrderType = typeof OrderType[keyof typeof OrderType];

export const OrderSide = {
    BUY: "BUY",
    SELL: "SELL"
} as const;

export type OrderSide = typeof OrderSide[keyof typeof OrderSide];

export const OrderRole = {
    MAKER: "MAKER",
    TAKER: "TAKER"
} as const;

export type OrderRole = typeof OrderRole[keyof typeof OrderRole];

export interface TpSlOrder {
    id?: string;
    orderId?: string;
    planId?: string;
    symbol: string;
    side?: string;
    planType?: "PROFIT" | "LOSS";
    triggerPrice?: string | number;
    executePrice?: string | number;
    qty?: string | number;
    status?: string;
    ctime?: number;
    createTime?: number;
    updateTime?: number;
}
