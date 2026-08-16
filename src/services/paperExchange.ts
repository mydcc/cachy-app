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
 * Simulated exchange — FEAT-0012.
 *
 * Sits behind exactly one seam: `tradeService.signedRequest`. It receives the
 * payload the real transport would have signed and returns the shape the real
 * exchange would have returned, so everything above it — order construction,
 * sizing, the FEAT-0011 gate, FEAT-0013's limits, OMS tracking, the journal,
 * the UI — runs identically in both modes.
 *
 * Every price, quantity, fee and PnL figure here is `Decimal`. A simulator
 * that accumulates float error teaches the user a balance that is wrong in
 * exactly the way the real one would not be.
 *
 * The price feed is injected rather than imported so the simulator can be
 * driven from a test without a market connection; in the app it reads the
 * same live feed the charts do, because a simulation running on stale or
 * synthetic prices proves nothing about the live path.
 */

import { Decimal } from "decimal.js";
import { paperState, type PaperOrder } from "../stores/paperTrading.svelte";

export class PaperExchangeError extends Error {
    constructor(
        public code: string,
        message: string,
    ) {
        super(message);
        this.name = "PaperExchangeError";
    }
}

/** Resolves the current price of a symbol, or null when the feed has none. */
export type PriceFeed = (symbol: string) => Decimal | null;

const BPS = new Decimal(10000);

let priceFeed: PriceFeed = () => null;

/**
 * Points the simulator at a price source. Called once at startup with the
 * live market store; tests pass their own.
 */
export function setPaperPriceFeed(feed: PriceFeed): void {
    priceFeed = feed;
}

function requirePrice(symbol: string): Decimal {
    const price = priceFeed(symbol);
    if (price === null || !price.isFinite() || price.lte(0)) {
        // Refusing is right: filling at a made-up price would produce a
        // simulated result the live path could never have produced.
        throw new PaperExchangeError("PAPER_NO_PRICE", `No price for ${symbol}`);
    }
    return price;
}

function toDecimal(value: unknown, fallback: Decimal | null = null): Decimal | null {
    if (value === null || value === undefined || value === "") return fallback;
    if (value instanceof Decimal || Decimal.isDecimal(value)) return value as Decimal;
    if (typeof value !== "string" && typeof value !== "number") return fallback;
    try {
        const d = new Decimal(value);
        return d.isFinite() && !d.isNaN() ? d : fallback;
    } catch {
        return fallback;
    }
}

/** Bitunix's success envelope, which the client already knows how to read. */
function ok(data: unknown): Record<string, unknown> {
    return { code: "0", msg: "Success", data };
}

interface FillResult {
    price: Decimal;
    qty: Decimal;
    fee: Decimal;
}

class PaperExchange {
    /**
     * Handles one transport call. `endpoint` and `payload` are exactly what
     * would have gone to the network.
     */
    public async handle(
        endpoint: string,
        payload: Record<string, unknown>,
    ): Promise<Record<string, unknown>> {
        await this.injectFailure();

        if (endpoint === "/api/tpsl") return this.handleTpSl(payload);
        return this.handleOrders(payload);
    }

    /**
     * Applies the configured failure mode before anything else. Rejection and
     * timeout are modelled as the transport failing, which is how the real
     * ones reach the caller.
     */
    private async injectFailure(): Promise<void> {
        const mode = paperState.config.failureMode;
        if (mode === "reject") {
            throw new PaperExchangeError("PAPER_REJECTED", "apiErrors.generic");
        }
        if (mode === "timeout") {
            throw new PaperExchangeError("PAPER_TIMEOUT", "apiErrors.timeout");
        }
        // "partial" is not a transport failure — it is handled at fill time.
    }

    private handleOrders(payload: Record<string, unknown>): Record<string, unknown> {
        const type = String(payload.type ?? "");
        switch (type) {
            case "place-order":
                return this.placeOrder(payload);
            case "flash-close-position":
                return this.flashClose(payload);
            case "close-all-positions":
                return this.closeAll(payload);
            case "cancel-order":
                return this.cancelOrder(payload);
            case "cancel-all":
                return this.cancelAll(payload);
            case "modify-order":
                return this.modifyOrder(payload);
            case "order-detail":
                return this.orderDetail(payload);
            case "pending":
                return ok({ orders: paperState.orders.map((o) => this.wireOrder(o)) });
            case "history":
                return ok({ orders: [] });
            default:
                throw new PaperExchangeError(
                    "PAPER_UNSUPPORTED",
                    `Paper mode does not implement ${type || "this request"}`,
                );
        }
    }

    /**
     * TP/SL plans are held rather than modelled: a simulated trigger that
     * fired differently from the real one would teach the wrong lesson about
     * stop behaviour, and modelling trigger semantics properly is its own
     * piece of work. They are accepted and tracked so the UI path is
     * exercised, and the fills come from the position closing instead.
     */
    private handleTpSl(payload: Record<string, unknown>): Record<string, unknown> {
        const action = String(payload.action ?? "");
        if (action === "cancel" || action === "modify") return ok({});
        return ok({ rows: [] });
    }

    // -- placing ------------------------------------------------------------

    private placeOrder(payload: Record<string, unknown>): Record<string, unknown> {
        const symbol = String(payload.symbol ?? "");
        const side = String(payload.side ?? "").toUpperCase() as "BUY" | "SELL";
        const orderType = String(payload.orderType ?? "MARKET").toUpperCase();
        const requested = toDecimal(payload.qty);

        if (!symbol) throw new PaperExchangeError("PAPER_BAD_SYMBOL", "Missing symbol");
        if (requested === null || requested.lte(0)) {
            throw new PaperExchangeError("PAPER_BAD_QTY", "apiErrors.invalidAmount");
        }

        const orderId = paperState.takeId("paper-order");
        const clientOrderId =
            typeof payload.clientOrderId === "string" ? payload.clientOrderId : undefined;

        // A limit or trigger order rests until the feed crosses it. Filling it
        // immediately would make every strategy that uses limits look better
        // than it is.
        if (orderType !== "MARKET") {
            const resting: PaperOrder = {
                orderId,
                clientOrderId,
                symbol,
                side,
                orderType,
                qty: requested.toString(),
                price: toDecimal(payload.price)?.toString(),
                triggerPrice: (
                    toDecimal(payload.triggerPrice) ?? toDecimal(payload.stopPrice)
                )?.toString(),
                reduceOnly: payload.reduceOnly === true,
                tradeSide: payload.tradeSide === "CLOSE" ? "CLOSE" : "OPEN",
                positionId:
                    typeof payload.positionId === "string" ? payload.positionId : undefined,
                createdAt: Date.now(),
            };
            paperState.setOrders([...paperState.orders, resting]);
            return ok({ orderId, clientOrderId });
        }

        const price = requirePrice(symbol);
        const qty = this.fillQuantity(requested);
        const closes = payload.tradeSide === "CLOSE" || payload.reduceOnly === true;

        const fill = closes
            ? this.applyClose(symbol, side, qty, price)
            : this.applyOpen(symbol, side, qty, price, toDecimal(payload.leverage, new Decimal(1))!);

        return ok({
            orderId,
            clientOrderId,
            price: fill.price.toString(),
            qty: fill.qty.toString(),
            fee: fill.fee.toString(),
            // A partial fill has to be visible to the caller, not silently
            // smaller than what was asked for.
            requestedQty: requested.toString(),
            partial: fill.qty.lt(requested),
        });
    }

    /** Slippage always works against the trader, on both sides of the book. */
    private fillPrice(reference: Decimal, side: "BUY" | "SELL"): Decimal {
        const slip = reference.times(paperState.numeric("slippageBps")).div(BPS);
        return side === "BUY" ? reference.plus(slip) : reference.minus(slip);
    }

    private fillQuantity(requested: Decimal): Decimal {
        if (paperState.config.failureMode !== "partial") return requested;
        const ratio = paperState.numeric("partialFillRatio");
        const filled = requested.times(ratio);
        return filled.gt(0) ? filled : requested;
    }

    private takerFee(notional: Decimal): Decimal {
        return notional.times(paperState.numeric("takerFeeBps")).div(BPS);
    }

    // -- position maths -----------------------------------------------------

    private applyOpen(
        symbol: string,
        side: "BUY" | "SELL",
        qty: Decimal,
        reference: Decimal,
        leverage: Decimal,
    ): FillResult {
        const price = this.fillPrice(reference, side);
        const notional = price.times(qty);
        const fee = this.takerFee(notional);
        const positionSide: "long" | "short" = side === "BUY" ? "long" : "short";

        const positions = [...paperState.positions];
        const index = positions.findIndex(
            (p) => p.symbol === symbol && p.side === positionSide,
        );

        if (index === -1) {
            positions.push({
                positionId: paperState.takeId("paper-pos"),
                symbol,
                side: positionSide,
                amount: qty.toString(),
                entryPrice: price.toString(),
                leverage: leverage.gt(0) ? leverage.toString() : "1",
                marginMode: "cross",
                realizedPnl: "0",
                openedAt: Date.now(),
            });
        } else {
            // Weighted average entry, the way the exchange reports it after an
            // add — not a replacement, which would silently reset the trade's
            // basis and make every subsequent PnL figure wrong.
            const existing = positions[index];
            const oldQty = new Decimal(existing.amount);
            const oldEntry = new Decimal(existing.entryPrice);
            const newQty = oldQty.plus(qty);
            const newEntry = oldEntry.times(oldQty).plus(price.times(qty)).div(newQty);
            positions[index] = {
                ...existing,
                amount: newQty.toString(),
                entryPrice: newEntry.toString(),
            };
        }

        paperState.setPositions(positions);
        paperState.setBalance(paperState.balance.minus(fee));
        return { price, qty, fee };
    }

    private applyClose(
        symbol: string,
        side: "BUY" | "SELL",
        qty: Decimal,
        reference: Decimal,
    ): FillResult {
        // Bitunix's close shape carries the *position's* side, not the
        // execution direction (see buildCloseOrderFields in tradeService), so
        // BUY closes a long here.
        const positionSide: "long" | "short" = side === "BUY" ? "long" : "short";
        const positions = [...paperState.positions];
        const index = positions.findIndex(
            (p) => p.symbol === symbol && p.side === positionSide,
        );
        if (index === -1) {
            throw new PaperExchangeError(
                "PAPER_NO_POSITION",
                "tradeErrors.positionNotFound",
            );
        }

        const position = positions[index];
        const held = new Decimal(position.amount);
        const closing = Decimal.min(qty, held);
        // Closing a long sells into the book, so slippage points the other way.
        const price = this.fillPrice(reference, positionSide === "long" ? "SELL" : "BUY");
        const entry = new Decimal(position.entryPrice);

        const gross =
            positionSide === "long"
                ? price.minus(entry).times(closing)
                : entry.minus(price).times(closing);
        const fee = this.takerFee(price.times(closing));
        const net = gross.minus(fee);

        const remaining = held.minus(closing);
        if (remaining.lte(0)) {
            positions.splice(index, 1);
        } else {
            positions[index] = {
                ...position,
                amount: remaining.toString(),
                realizedPnl: new Decimal(position.realizedPnl).plus(net).toString(),
            };
        }

        paperState.setPositions(positions);
        paperState.setBalance(paperState.balance.plus(net));
        return { price, qty: closing, fee };
    }

    // -- closing / cancelling ------------------------------------------------

    private flashClose(payload: Record<string, unknown>): Record<string, unknown> {
        const positionId = String(payload.positionId ?? "");
        const position = paperState.positions.find((p) => p.positionId === positionId);
        if (!position) {
            throw new PaperExchangeError(
                "PAPER_NO_POSITION",
                "tradeErrors.positionNotFound",
            );
        }
        const price = requirePrice(position.symbol);
        const fill = this.applyClose(
            position.symbol,
            position.side === "long" ? "BUY" : "SELL",
            new Decimal(position.amount),
            price,
        );
        return ok({ positionId, price: fill.price.toString(), qty: fill.qty.toString() });
    }

    private closeAll(payload: Record<string, unknown>): Record<string, unknown> {
        const symbol = typeof payload.symbol === "string" ? payload.symbol : undefined;
        const targets = paperState.positions.filter(
            (p) => symbol === undefined || p.symbol === symbol,
        );
        for (const position of targets) {
            const price = requirePrice(position.symbol);
            this.applyClose(
                position.symbol,
                position.side === "long" ? "BUY" : "SELL",
                new Decimal(position.amount),
                price,
            );
        }
        return ok({ closed: targets.length });
    }

    private cancelOrder(payload: Record<string, unknown>): Record<string, unknown> {
        const orderId = String(payload.orderId ?? "");
        const remaining = paperState.orders.filter((o) => o.orderId !== orderId);
        if (remaining.length === paperState.orders.length) {
            throw new PaperExchangeError("PAPER_NO_ORDER", "tradeErrors.orderNotFound");
        }
        paperState.setOrders(remaining);
        return ok({ orderId });
    }

    private cancelAll(payload: Record<string, unknown>): Record<string, unknown> {
        const symbol = typeof payload.symbol === "string" ? payload.symbol : undefined;
        const before = paperState.orders.length;
        paperState.setOrders(
            symbol === undefined
                ? []
                : paperState.orders.filter((o) => o.symbol !== symbol),
        );
        return ok({ successList: [], failureList: [], cancelled: before - paperState.orders.length });
    }

    private modifyOrder(payload: Record<string, unknown>): Record<string, unknown> {
        const orderId = String(payload.orderId ?? "");
        const orders = [...paperState.orders];
        const index = orders.findIndex((o) => o.orderId === orderId);
        if (index === -1) {
            throw new PaperExchangeError("PAPER_NO_ORDER", "tradeErrors.orderNotFound");
        }
        const qty = toDecimal(payload.qty);
        const price = toDecimal(payload.price);
        orders[index] = {
            ...orders[index],
            qty: qty ? qty.toString() : orders[index].qty,
            price: price ? price.toString() : orders[index].price,
        };
        paperState.setOrders(orders);
        return ok({ orderId, clientId: orders[index].clientOrderId });
    }

    private orderDetail(payload: Record<string, unknown>): Record<string, unknown> {
        const orderId = typeof payload.orderId === "string" ? payload.orderId : undefined;
        const clientId = typeof payload.clientId === "string" ? payload.clientId : undefined;
        const order = paperState.orders.find(
            (o) => (orderId && o.orderId === orderId) || (clientId && o.clientOrderId === clientId),
        );
        if (!order) {
            throw new PaperExchangeError("PAPER_NO_ORDER", "tradeErrors.orderNotFound");
        }
        return ok(this.wireOrder(order));
    }

    private wireOrder(order: PaperOrder): Record<string, unknown> {
        return {
            orderId: order.orderId,
            clientId: order.clientOrderId,
            id: order.orderId,
            symbol: order.symbol,
            side: order.side,
            amount: order.qty,
            qty: order.qty,
            price: order.price,
            status: "NEW",
            time: order.createdAt,
        };
    }

    // -- resting orders ------------------------------------------------------

    /**
     * Fills any resting order the feed has crossed. Called on each price
     * update; separate from `handle` because nothing requested it.
     */
    public settleRestingOrders(symbol: string, price: Decimal): void {
        const remaining: PaperOrder[] = [];
        let changed = false;

        for (const order of paperState.orders) {
            if (order.symbol !== symbol || !this.hasCrossed(order, price)) {
                remaining.push(order);
                continue;
            }
            changed = true;
            const qty = new Decimal(order.qty);
            const closes = order.tradeSide === "CLOSE" || order.reduceOnly;
            try {
                if (closes) {
                    this.applyClose(order.symbol, order.side, qty, price);
                } else {
                    this.applyOpen(order.symbol, order.side, qty, price, new Decimal(1));
                }
            } catch {
                // A close with no position left is not an error worth
                // surfacing — the position went away, the order is moot.
            }
        }

        if (changed) paperState.setOrders(remaining);
    }

    private hasCrossed(order: PaperOrder, price: Decimal): boolean {
        const level = toDecimal(order.price) ?? toDecimal(order.triggerPrice);
        if (level === null) return false;
        // A buy fills at or below its level, a sell at or above it.
        return order.side === "BUY" ? price.lte(level) : price.gte(level);
    }
}

export const paperExchange = new PaperExchange();
