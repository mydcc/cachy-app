/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * Order parameter shapes, extracted from tradeService.ts (FEAT-0342).
 * Type-only module: Decimal and OrderOrigin are imported as types, so no
 * runtime edge exists toward orderGate or decimal.js consumers.
 */
import type { Decimal } from "decimal.js";
import type { OrderOrigin } from "../orderGate";

export interface TpSlOrder {
    orderId: string;
    symbol: string;
    planType: "PROFIT" | "LOSS";
    triggerPrice: string;
    qty?: string;
    status: string;
    ctime?: number;
    createTime?: number;
    id?: string;
    planId?: string;
    // Hardened types
    side?: string;
    price?: string;
    executePrice?: string;
    clientOrderId?: string;
    reduceOnly?: boolean;
    workingType?: string;
    timeInForce?: string;
    /**
     * The id of the venue row this leg was split out of (BUG-0292).
     *
     * `orderId` above is a *leg* id — `${sourceOrderId}-tp` or `-sl` — because
     * one Bitunix row carries both legs and the rest of the app models one
     * plan per leg. Anything addressing the venue (cancel, modify) must use
     * this, not `orderId`, or it names a plan the exchange has never heard of.
     */
    sourceOrderId?: string;
    /**
     * The position this plan protects, as the venue reports it (BUG-0524).
     *
     * Present on Bitunix rows and WS pushes; absent elsewhere. The placement
     * confirmation uses it to tell hedge sides apart — price plus side
     * cannot, because production plans carry no side. Never required:
     * matching falls back to price plus identity when either side is
     * unknown.
     */
    positionId?: string;
    /**
     * Whether this plan looks position-wide or partial, **inferred** from
     * whether its leg named a quantity. The response carries no field saying
     * which it is; see BUG-0292. Safe to show, not safe to place an order on.
     */
    scopeGuess?: "position" | "partial";
    [key: string]: unknown; // Safer than any
}

/**
 * One entry submission. Extracted from `placeOrder`'s inline parameter object
 * in FEAT-0016 so the adapter's `TradingPort` can name the same shape rather
 * than restate it — two copies of an order payload's type is how the two
 * drift.
 */
export interface PlaceOrderParams {
    symbol: string;
    side: "BUY" | "SELL";
    /**
     * Where the order came from. Required, not optional-with-default: a new
     * call site that omits it must fail to compile rather than silently take
     * the live path (BUG-0494). The venue adapters forward params wholesale,
     * so they carry it without knowing it.
     */
    origin: OrderOrigin;
    orderType?: "LIMIT" | "MARKET";
    qty: Decimal | string;
    price?: Decimal | string;
    /** Time in force. Ignored for market orders — see the route. */
    effect?: "GTC" | "IOC" | "FOK" | "POST_ONLY";
    /** Pass the previous attempt's id to retry it idempotently. */
    clientId?: string;
    reduceOnly?: boolean;
    tradeSide?: "OPEN" | "CLOSE";
    positionId?: string;
    takeProfit?: {
        price: Decimal | string;
        stopType?: "MARK_PRICE" | "LAST_PRICE";
        orderType?: "LIMIT" | "MARKET";
        orderPrice?: Decimal | string;
    };
    stopLoss?: {
        price: Decimal | string;
        stopType?: "MARK_PRICE" | "LAST_PRICE";
        orderType?: "LIMIT" | "MARKET";
        orderPrice?: Decimal | string;
    };
    /**
     * What the UI showed when the user confirmed. The gate compares the
     * payload against this rather than against the values it was built
     * from — see FEAT-0011.
     */
    displayed: {
        accountSize: Decimal;
        riskPercentage: Decimal;
        entryPrice: Decimal;
        stopLossPrice: Decimal;
        takeProfits?: Decimal[];
        leverage?: Decimal;
        marginMode?: string;
        accountStateAt?: number;
        stepSize?: Decimal;
    };
}

export interface ModifyOrderParams {
    orderId?: string;
    clientId?: string;
    symbol?: string;
    qty?: string | Decimal | number;
    price?: string | Decimal | number;
    tpPrice?: string | Decimal | number;
    tpStopType?: string;
    tpOrderType?: string;
    tpOrderPrice?: string | Decimal | number;
    slPrice?: string | Decimal | number;
    slStopType?: string;
    slOrderType?: string;
    slOrderPrice?: string | Decimal | number;
}
