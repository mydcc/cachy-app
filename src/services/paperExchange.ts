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
import { paperState, type PaperFill, type PaperOrder } from "../stores/paperTrading.svelte";

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

/** Resolves the leverage an entry on this symbol should be recorded at. */
export type LeverageFeed = (symbol: string) => Decimal | null;

const BPS = new Decimal(10000);

let priceFeed: PriceFeed = () => null;
let leverageFeed: LeverageFeed = () => null;
let bookListener: (() => void) | null = null;

/**
 * Points the simulator at a price source. Called once at startup with the
 * live market store; tests pass their own.
 */
export function setPaperPriceFeed(feed: PriceFeed): void {
    priceFeed = feed;
}

/**
 * Points the simulator at the leverage the trader is working at — FEAT-0327.
 *
 * Injected rather than read off the payload because the place-order payload
 * carries no leverage field (`tradeService.placeOrder`): leverage is account
 * state on the venue, set separately, so an order never states it. Defaulting
 * to 1x instead reported every simulated position as unlevered, which
 * understates both the margin it would have cost and the risk it carried.
 */
export function setPaperLeverageFeed(feed: LeverageFeed): void {
    leverageFeed = feed;
}

/**
 * Registers the one listener told that the book moved — FEAT-0327.
 *
 * A fill has to reach the account stores when it happens, not on the next
 * price tick: an order placed on a symbol whose feed is quiet would otherwise
 * sit invisible for as long as the market is quiet, which is exactly when a
 * trader looks hardest for it.
 *
 * The simulator stays free of store imports; the listener is what knows
 * about them.
 */
export function setPaperBookListener(listener: (() => void) | null): void {
    bookListener = listener;
}

function announceBookChange(): void {
    if (!bookListener) return;
    try {
        bookListener();
    } catch {
        // A consumer that throws must not unwind the fill that already
        // happened — the book is authoritative, the mirror is not.
    }
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

/**
 * `/api/tpsl`'s shape, which is *not* the envelope — FEAT-0327.
 *
 * That route unwraps Bitunix's response and returns `res.data` flat
 * (`routes/api/tpsl/+server.ts`), and the simulator sits behind the route, not
 * behind the venue. Answering with `ok()` here — as this file did — put the
 * rows one level too deep, so `fetchTpSlOrders` read `data.rows` off an
 * envelope and found nothing. It failed silently, because an empty plan list
 * is a legitimate answer.
 */
function flat(data: Record<string, unknown>): Record<string, unknown> {
    return data;
}

interface FillResult {
    price: Decimal;
    qty: Decimal;
    fee: Decimal;
    /** Realised PnL net of this fill's fee. Zero on an open. */
    realizedPnl: Decimal;
    /** The position this fill opened, added to or reduced. */
    positionId: string;
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

        const response =
            endpoint === "/api/tpsl" ? this.handleTpSl(payload) : this.handleOrders(payload);

        // After the book has moved and before the caller sees the response,
        // so the account stores are already consistent with the answer the
        // caller is about to act on. A request that threw never gets here —
        // nothing moved, so there is nothing to announce.
        announceBookChange();
        return response;
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
                // Plans are not pending *orders*: the venue keeps them on
                // their own endpoint, and listing them here too would show
                // every stop twice, in two tabs, with two cancel buttons.
                return ok({
                    orders: paperState.orders
                        .filter((o) => o.planGroupId === undefined)
                        .map((o) => this.wireOrder(o)),
                });
            case "history":
                // FEAT-0327: the executed fills, newest first — the same
                // question the venue's history endpoint answers. Returning an
                // empty list here is what left a paper account with no record
                // of anything it had ever done.
                return ok({
                    orders: [...paperState.fills].reverse().map((f) => this.wireFill(f)),
                });
            default:
                throw new PaperExchangeError(
                    "PAPER_UNSUPPORTED",
                    `Paper mode does not implement ${type || "this request"}`,
                );
        }
    }

    /**
     * TP/SL plans — FEAT-0327.
     *
     * These were accepted and then never reported: a `pending` read answered
     * with an empty list, so `orderPlacementService.confirmProtection` looked
     * for the stop it had just attached, did not find it, and told the trader
     * every simulated entry was unprotected. The plans were there the whole
     * time; nothing would say so.
     *
     * The rows go out in the venue's shape — one row carrying both legs, no
     * `planType`, no `triggerPrice` — so `normalizeTpSlRows` splits them the
     * same way it splits Bitunix's (BUG-0292). Returning the already-split
     * shape would have been easier and would have left that splitter
     * unexercised in paper mode, which is the one place it is cheap to test.
     */
    private handleTpSl(payload: Record<string, unknown>): Record<string, unknown> {
        const action = String(payload.action ?? "");
        const params = (payload.params ?? {}) as Record<string, unknown>;

        switch (action) {
            case "pending":
                return flat({ rows: this.tpSlRows(params) });
            case "history":
                // No plan history is modelled: a cancelled plan leaves the
                // book. Reporting an empty list is the honest answer, not the
                // placeholder it used to be for every action here.
                return flat({ rows: [] });
            case "place":
            case "place-position":
                return this.placeTpSlPlan(params, action === "place-position");
            case "cancel":
                return this.cancelTpSlPlan(payload, params);
            case "modify":
                return this.modifyTpSlPlan(payload, params);
            default:
                throw new PaperExchangeError(
                    "PAPER_UNSUPPORTED",
                    `Paper mode does not implement ${action || "this plan request"}`,
                );
        }
    }

    /** The book's plans, grouped back into the venue's one-row-per-plan shape. */
    private tpSlRows(params: Record<string, unknown>): Record<string, unknown>[] {
        const symbol = typeof params.symbol === "string" ? params.symbol : undefined;
        const rows = new Map<string, Record<string, unknown>>();

        for (const order of paperState.orders) {
            if (order.planGroupId === undefined || order.planType === undefined) continue;
            if (symbol !== undefined && order.symbol !== symbol) continue;

            const row = rows.get(order.planGroupId) ?? {
                id: order.planGroupId,
                orderId: order.planGroupId,
                symbol: order.symbol,
                positionId: order.positionId,
                status: "NEW",
                ctime: order.createdAt,
            };
            const prefix = order.planType === "TP" ? "tp" : "sl";
            row[`${prefix}Price`] = order.triggerPrice;
            row[`${prefix}StopType`] = order.stopType ?? "MARK_PRICE";
            row[`${prefix}OrderType`] = order.orderType;
            // A position-wide plan names no quantity, which is exactly how
            // the normaliser tells the two scopes apart.
            if (order.planScope !== "position") row[`${prefix}Qty`] = order.qty;
            rows.set(order.planGroupId, row);
        }

        return Array.from(rows.values());
    }

    /**
     * Creates a plan against an open position.
     *
     * `positionWide` closes whatever the position holds when it fires, so a
     * position that is added to stays covered; a partial plan covers the
     * quantity it names.
     */
    private placeTpSlPlan(
        params: Record<string, unknown>,
        positionWide: boolean,
    ): Record<string, unknown> {
        const symbol = String(params.symbol ?? "");
        const positionId =
            typeof params.positionId === "string" ? params.positionId : undefined;
        const position = paperState.positions.find((p) =>
            positionId !== undefined ? p.positionId === positionId : p.symbol === symbol,
        );
        if (!position) {
            throw new PaperExchangeError(
                "PAPER_NO_POSITION",
                "tradeErrors.positionNotFound",
            );
        }

        const groupId = paperState.takeId("paper-tpsl");
        const entry = new Decimal(position.entryPrice);
        const created: PaperOrder[] = [];

        for (const [prefix, planType] of [
            ["tp", "TP"],
            ["sl", "SL"],
        ] as const) {
            const trigger = toDecimal(params[`${prefix}Price`]);
            if (trigger === null || trigger.lte(0)) continue;
            const qty = positionWide
                ? new Decimal(position.amount)
                : (toDecimal(params[`${prefix}Qty`]) ?? new Decimal(position.amount));

            created.push({
                orderId: paperState.takeId("paper-plan"),
                planGroupId: groupId,
                symbol: position.symbol,
                // The position's own side, which is what the close path reads.
                side: position.side === "long" ? "BUY" : "SELL",
                orderType: String(params[`${prefix}OrderType`] ?? "MARKET").toUpperCase(),
                qty: qty.toString(),
                triggerPrice: trigger.toString(),
                triggerDirection: trigger.gt(entry) ? "above" : "below",
                planType,
                planScope: positionWide ? "position" : "partial",
                stopType: String(params[`${prefix}StopType`] ?? "MARK_PRICE"),
                reduceOnly: true,
                tradeSide: "CLOSE",
                positionId: position.positionId,
                createdAt: Date.now(),
            });
        }

        if (created.length === 0) {
            throw new PaperExchangeError("PAPER_TPSL_NO_LEG", "apiErrors.tpslNoLeg");
        }

        // Bitunix allows one position-wide plan per position and refuses a
        // second; replacing is what the edit flow above this expects.
        const kept = positionWide
            ? paperState.orders.filter(
                  (o) =>
                      !(
                          o.positionId === position.positionId &&
                          o.planScope === "position"
                      ),
              )
            : [...paperState.orders];

        paperState.setOrders([...kept, ...created]);
        return flat({ orderId: groupId, id: groupId });
    }

    /** Removes one plan row, or one leg of it when the caller named a type. */
    private cancelTpSlPlan(
        payload: Record<string, unknown>,
        params: Record<string, unknown>,
    ): Record<string, unknown> {
        const groupId = String(params.orderId ?? payload.orderId ?? "");
        const planType =
            params.planType === "PROFIT" ? "TP" : params.planType === "LOSS" ? "SL" : undefined;

        const remaining = paperState.orders.filter(
            (o) =>
                o.planGroupId !== groupId ||
                (planType !== undefined && o.planType !== planType),
        );
        if (remaining.length === paperState.orders.length) {
            throw new PaperExchangeError("PAPER_NO_ORDER", "tradeErrors.orderNotFound");
        }
        paperState.setOrders(remaining);
        return flat({ orderId: groupId });
    }

    /** Moves the trigger of one leg of an existing plan. */
    private modifyTpSlPlan(
        payload: Record<string, unknown>,
        params: Record<string, unknown>,
    ): Record<string, unknown> {
        const groupId = String(params.orderId ?? payload.orderId ?? "");
        const orders = [...paperState.orders];
        let touched = false;

        for (const [prefix, planType] of [
            ["tp", "TP"],
            ["sl", "SL"],
        ] as const) {
            const trigger = toDecimal(params[`${prefix}Price`]);
            if (trigger === null || trigger.lte(0)) continue;
            const index = orders.findIndex(
                (o) => o.planGroupId === groupId && o.planType === planType,
            );
            if (index === -1) continue;

            const position = paperState.positions.find(
                (p) => p.positionId === orders[index].positionId,
            );
            const qty = toDecimal(params[`${prefix}Qty`]);
            orders[index] = {
                ...orders[index],
                triggerPrice: trigger.toString(),
                // Re-derived, not carried over: moving a stop through the
                // entry turns it into a plan that fires the other way, and a
                // stale direction would leave it waiting for a move that
                // never comes.
                triggerDirection: position
                    ? trigger.gt(position.entryPrice)
                        ? "above"
                        : "below"
                    : orders[index].triggerDirection,
                qty: qty !== null && qty.gt(0) ? qty.toString() : orders[index].qty,
                stopType: String(params[`${prefix}StopType`] ?? orders[index].stopType ?? "MARK_PRICE"),
            };
            touched = true;
        }

        if (!touched) {
            throw new PaperExchangeError("PAPER_NO_ORDER", "tradeErrors.orderNotFound");
        }
        paperState.setOrders(orders);
        return flat({ orderId: groupId });
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
            : this.applyOpen(symbol, side, qty, price, this.entryLeverage(symbol, payload));
        this.recordFill(fill, {
            orderId,
            symbol,
            side,
            orderType,
            tradeSide: closes ? "CLOSE" : "OPEN",
        });

        // FEAT-0069: TP/SL attached to the entry become resting orders on the
        // position the entry just created, which is what the exchange does
        // with them. Simulating the atomic form as two separate steps would
        // hide exactly the window this feature exists to close.
        if (!closes) {
            this.attachEntryPlans(symbol, side, fill.qty, payload, fill.price, fill.positionId);
        }

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

    /**
     * The leverage to record an entry at.
     *
     * The payload is preferred when it carries one — a caller that states it
     * is stating a fact about this order — and the injected feed answers
     * otherwise, since Bitunix's place_order never carries the field.
     */
    private entryLeverage(symbol: string, payload: Record<string, unknown>): Decimal {
        const stated = toDecimal(payload.leverage);
        if (stated !== null && stated.gt(0)) return stated;
        const fed = leverageFeed(symbol);
        if (fed !== null && fed.isFinite() && fed.gt(0)) return fed;
        return new Decimal(1);
    }

    /** Writes one executed fill into the book's audit record (FEAT-0327). */
    private recordFill(
        fill: FillResult,
        context: {
            orderId: string;
            symbol: string;
            side: "BUY" | "SELL";
            orderType: string;
            tradeSide: "OPEN" | "CLOSE";
        },
    ): void {
        if (fill.qty.lte(0)) return;
        const record: PaperFill = {
            fillId: paperState.takeId("paper-fill"),
            orderId: context.orderId,
            symbol: context.symbol,
            side: context.side,
            tradeSide: context.tradeSide,
            orderType: context.orderType,
            qty: fill.qty.toString(),
            price: fill.price.toString(),
            fee: fill.fee.toString(),
            realizedPnl: fill.realizedPnl.toString(),
            positionId: fill.positionId,
            createdAt: Date.now(),
        };
        paperState.addFill(record);
    }

    /**
     * Turns `tpPrice`/`slPrice` sent with an entry into resting reduce-only
     * orders against the position that entry opened.
     */
    private attachEntryPlans(
        symbol: string,
        side: "BUY" | "SELL",
        qty: Decimal,
        payload: Record<string, unknown>,
        entryPrice: Decimal,
        positionId: string,
    ): void {
        const attached: PaperOrder[] = [];
        // Closing side, in the shape the close path expects: the position's
        // own side, not the execution direction (see applyClose).
        const closeSide: "BUY" | "SELL" = side;
        // Both legs belong to one plan row, the way the venue returns them.
        const groupId = paperState.takeId("paper-tpsl");

        for (const [priceKey, typeKey, stopKey, planType] of [
            ["tpPrice", "tpOrderType", "tpStopType", "TP"],
            ["slPrice", "slOrderType", "slStopType", "SL"],
        ] as const) {
            const trigger = toDecimal(payload[priceKey]);
            if (trigger === null || trigger.lte(0)) continue;
            attached.push({
                orderId: paperState.takeId("paper-plan"),
                planGroupId: groupId,
                symbol,
                side: closeSide,
                orderType: String(payload[typeKey] ?? "MARKET").toUpperCase(),
                stopType: String(payload[stopKey] ?? "MARK_PRICE"),
                // Bitunix's place_order attaches a *position-wide* plan: it
                // names no quantity and covers whatever the position holds.
                // Freezing it at the entry quantity would leave the part of a
                // later add uncovered, with a stop on screen saying otherwise.
                planScope: "position",
                qty: qty.toString(),
                triggerPrice: trigger.toString(),
                // Derived from where the level sits relative to the entry,
                // not from the order side — both plans on a long are closing
                // BUY orders, but the target fires above and the stop below.
                triggerDirection: trigger.gt(entryPrice) ? "above" : "below",
                planType,
                reduceOnly: true,
                tradeSide: "CLOSE",
                // FEAT-0327: without this the plan belongs to no position, so
                // the panel could not show it on the card it protects and the
                // journal could not read the stop the trade was taken with.
                positionId,
                createdAt: Date.now(),
            });
        }

        if (attached.length > 0) {
            paperState.setOrders([...paperState.orders, ...attached]);
        }
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

        let positionId: string;
        if (index === -1) {
            positionId = paperState.takeId("paper-pos");
            positions.push({
                positionId,
                symbol,
                side: positionSide,
                amount: qty.toString(),
                entryPrice: price.toString(),
                leverage: leverage.gt(0) ? leverage.toString() : "1",
                marginMode: "cross",
                realizedPnl: "0",
                openedAt: Date.now(),
                // Before the entry fee comes off below: the journal has to
                // report the account the trade was sized against, not the
                // account one fee later.
                accountSizeAtEntry: paperState.balance.toString(),
            });
        } else {
            // Weighted average entry, the way the exchange reports it after an
            // add — not a replacement, which would silently reset the trade's
            // basis and make every subsequent PnL figure wrong.
            const existing = positions[index];
            positionId = existing.positionId;
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
        return { price, qty, fee, realizedPnl: new Decimal(0), positionId };
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
            // A position that is gone cannot carry its own plans any more.
            // The exchange cancels them on a full close; leaving them resting
            // here would have them fire later against nothing, or worse,
            // against a new position that reused the symbol.
            paperState.setOrders(
                paperState.orders.filter((o) => o.positionId !== position.positionId),
            );
        } else {
            positions[index] = {
                ...position,
                amount: remaining.toString(),
                realizedPnl: new Decimal(position.realizedPnl).plus(net).toString(),
            };
        }

        paperState.setPositions(positions);
        paperState.setBalance(paperState.balance.plus(net));
        return {
            price,
            qty: closing,
            fee,
            realizedPnl: net,
            positionId: position.positionId,
        };
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
        const side = position.side === "long" ? "BUY" : "SELL";
        const orderId = paperState.takeId("paper-order");
        const fill = this.applyClose(
            position.symbol,
            side,
            new Decimal(position.amount),
            price,
        );
        this.recordFill(fill, {
            orderId,
            symbol: position.symbol,
            side,
            orderType: "MARKET",
            tradeSide: "CLOSE",
        });
        return ok({ positionId, price: fill.price.toString(), qty: fill.qty.toString() });
    }

    private closeAll(payload: Record<string, unknown>): Record<string, unknown> {
        const symbol = typeof payload.symbol === "string" ? payload.symbol : undefined;
        const targets = paperState.positions.filter(
            (p) => symbol === undefined || p.symbol === symbol,
        );
        for (const position of targets) {
            const price = requirePrice(position.symbol);
            const side = position.side === "long" ? "BUY" : "SELL";
            const orderId = paperState.takeId("paper-order");
            const fill = this.applyClose(
                position.symbol,
                side,
                new Decimal(position.amount),
                price,
            );
            this.recordFill(fill, {
                orderId,
                symbol: position.symbol,
                side,
                orderType: "MARKET",
                tradeSide: "CLOSE",
            });
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
            type: order.orderType,
            amount: order.qty,
            qty: order.qty,
            price: order.price,
            filled: "0",
            fee: "0",
            realizedPNL: "0",
            reduceOnly: order.reduceOnly,
            status: "NEW",
            time: order.createdAt,
            // The plan's trigger, under the names the order list already
            // renders, so an attached stop reads the same as a venue's does.
            ...(order.planType === "TP" ? { tpPrice: order.triggerPrice } : {}),
            ...(order.planType === "SL" ? { slPrice: order.triggerPrice } : {}),
        };
    }

    /**
     * An executed fill in the shape the order-history list reads (FEAT-0327).
     *
     * `status: "FILLED"` because that is what it is: the history tab
     * distinguishes filled from cancelled, and a simulated fill that reported
     * anything else would sort itself into the wrong half of the tab.
     */
    private wireFill(fill: PaperFill): Record<string, unknown> {
        return {
            orderId: fill.orderId,
            id: fill.fillId,
            symbol: fill.symbol,
            side: fill.side,
            type: fill.orderType,
            price: fill.price,
            avgPrice: fill.price,
            amount: fill.qty,
            qty: fill.qty,
            filled: fill.qty,
            status: "FILLED",
            time: fill.createdAt,
            mtime: fill.createdAt,
            fee: fill.fee,
            realizedPNL: fill.realizedPnl,
            reduceOnly: fill.tradeSide === "CLOSE",
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
            const closes = order.tradeSide === "CLOSE" || order.reduceOnly;
            // A position-wide plan closes what the position holds *now*, not
            // what it held when the plan was attached.
            const tracked =
                order.planScope === "position"
                    ? paperState.positions.find(
                          (p) => p.positionId === order.positionId,
                      )
                    : undefined;
            const qty = new Decimal(tracked?.amount ?? order.qty);
            try {
                const fill = closes
                    ? this.applyClose(order.symbol, order.side, qty, price)
                    : this.applyOpen(
                          order.symbol,
                          order.side,
                          qty,
                          price,
                          this.entryLeverage(order.symbol, {}),
                      );
                this.recordFill(fill, {
                    orderId: order.orderId,
                    symbol: order.symbol,
                    side: order.side,
                    orderType: order.orderType,
                    tradeSide: closes ? "CLOSE" : "OPEN",
                });
            } catch {
                // A close with no position left is not an error worth
                // surfacing — the position went away, the order is moot.
            }
        }

        if (changed) {
            // A full close inside applyClose already dropped this position's
            // plans, so intersect rather than assign: writing `remaining`
            // wholesale would resurrect a cancelled plan.
            const survivors = new Set(paperState.orders.map((o) => o.orderId));
            paperState.setOrders(remaining.filter((o) => survivors.has(o.orderId)));
            announceBookChange();
        }
    }

    private hasCrossed(order: PaperOrder, price: Decimal): boolean {
        const level = toDecimal(order.price) ?? toDecimal(order.triggerPrice);
        if (level === null) return false;
        // An attached plan carries its own direction, because a take-profit
        // and a stop-loss on the same position are the same side and fire
        // opposite ways.
        if (order.triggerDirection) {
            return order.triggerDirection === "above"
                ? price.gte(level)
                : price.lte(level);
        }
        // A plain limit order: a buy fills at or below its level, a sell at
        // or above it.
        return order.side === "BUY" ? price.lte(level) : price.gte(level);
    }
}

export const paperExchange = new PaperExchange();
