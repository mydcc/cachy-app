/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * Take-profit / stop-loss reads and writes — extracted from tradeService.ts
 * (FEAT-0342).
 *
 * TP/SL is the one domain with its own wire vocabulary (per-leg `tp*`/`sl*`
 * fields rather than `planType` + `triggerPrice`) and the only one whose
 * `kind` is "modify" even when it opens a plan: setting a stop reduces
 * exposure and must keep working while the kill switch is engaged. Keeping it
 * in its own module is what lets that stay legible.
 *
 * Everything it needs from the owner arrives as a port — the gate for writes,
 * the signed transport for reads, and the handful of store reads a service may
 * not perform itself (eslint.architecture.boundaries.js).
 */

import { Decimal } from "decimal.js";
import { logger } from "../logger";
import { omsService } from "../omsService";
import { normalizeTpSlRows } from "../tpslNormalize";
import { formatApiNum } from "../../utils/utils";
import { buildTpslReadQueryParams } from "../../utils/exchange/venueQueries";
import type { GatePass, OrderOrigin } from "../orderGate";
import { BitunixApiError } from "./tradeErrors";
import type { TpSlOrder } from "./tradeParams";
import type { PartialIntent } from "./payloadCodec";

/** The venue the UI is configured for; decides the envelope below. */
export type TpSlVenue = "bitunix" | "bitget";

export interface ModifyTpSlParams {
    orderId: string;
    symbol: string;
    planType: "PROFIT" | "LOSS";
    triggerPrice: string;
    qty?: string;
    stopType?: "LAST_PRICE" | "MARK_PRICE";
    context?: { side: "long" | "short"; entryPrice: Decimal };
    tickSize?: Decimal;
    /**
     * When the user confirmed, as `Date.now()` — BUG-0663.
     *
     * A chart drag is a modify the trader may not be looking at, so it obeys
     * the `modify-order` policy. The wire action `/api/tpsl` carries is
     * `"modify"`, which is not a catalogue member, so the gate would read the
     * wire action and find nothing to ask about; `confirmAs` below names the
     * policy action instead — but only on a request that confirmed. An
     * unconfirmed request names nothing and travels exactly as before, which
     * is what keeps the edit modal (same function, no dialog yet) working
     * under the toggle until it learns to ask.
     */
    confirmedAt?: number;
}

export interface PlacePositionTpSlParams {
    symbol: string;
    positionId: string;
    takeProfit?: { price: Decimal; stopType?: "LAST_PRICE" | "MARK_PRICE" };
    stopLoss?: { price: Decimal; stopType?: "LAST_PRICE" | "MARK_PRICE" };
    context?: { side: "long" | "short"; entryPrice: Decimal };
    tickSize?: Decimal;
}

export interface PlaceTpSlParams {
    symbol: string;
    positionId: string;
    takeProfit?: {
        price: Decimal;
        qty: Decimal;
        stopType?: "LAST_PRICE" | "MARK_PRICE";
        orderType?: "LIMIT" | "MARKET";
        orderPrice?: Decimal;
    };
    stopLoss?: {
        price: Decimal;
        qty: Decimal;
        stopType?: "LAST_PRICE" | "MARK_PRICE";
        orderType?: "LIMIT" | "MARKET";
        orderPrice?: Decimal;
    };
    context?: { side: "long" | "short"; entryPrice: Decimal };
    tickSize?: Decimal;
}

export interface TpSlPorts {
    /** The order gate. Every write goes through it — there is no other path. */
    gatedRequest: <T>(intent: PartialIntent) => Promise<T>;
    /** The signed transport, for reads. Paper mode answers from the simulator. */
    signedRequest: <T>(
        endpoint: string,
        payload: Record<string, unknown>,
        pass?: GatePass,
        queryParams?: Record<string, string>,
        origin?: OrderOrigin,
    ) => Promise<T>;
    activeVenue(): TpSlVenue;
    /** Whether the active account carries both key and secret for that venue. */
    hasActiveKeys(): boolean;
    isPaperMode(): boolean;
    activeSymbol(): string | undefined;
}

export interface TpSlService {
    fetchTpSlOrders(view?: "pending" | "history"): Promise<TpSlOrder[]>;
    cancelTpSlOrder(order: TpSlOrder): Promise<unknown>;
    modifyTpSlOrder(params: ModifyTpSlParams): Promise<unknown>;
    placePositionTpSl(params: PlacePositionTpSlParams): Promise<unknown>;
    placeTpSlOrder(params: PlaceTpSlParams): Promise<unknown>;
}

export function createTpSlService(ports: TpSlPorts): TpSlService {
    async function fetchTpSlOrders(view: "pending" | "history" = "pending"): Promise<TpSlOrder[]> {
        const provider = ports.activeVenue();
        const hasKeys = ports.hasActiveKeys();
        /*
         * Credentials are what a *venue* needs, and this read goes through
         * `signedRequest`, which answers from the simulator in paper mode
         * without touching the network (FEAT-0327).
         *
         * Not a mode branch: the request built below is identical either way.
         * This only stops the guard from refusing, before the seam is even
         * reached, a read that needs no credentials — which is what told
         * `orderPlacementService` that every simulated entry's stop was
         * missing, and reported a protected position as unprotected.
         */
        if (!ports.isPaperMode() && !hasKeys) {
            throw new Error("dashboard.alerts.noApiKeys");
        }

        if (provider === "bitunix") {
            const symbolsToFetch = new Set<string>();
            // Add current active symbol
            const active = ports.activeSymbol();
            if (active) symbolsToFetch.add(active);
            // Add all symbols with open positions
            const positions = omsService.getPositions();
            positions.forEach((p) => symbolsToFetch.add(p.symbol));

            const fetchList = symbolsToFetch.size > 0 ? Array.from(symbolsToFetch) : [undefined];
            const results: TpSlOrder[] = [];

            // Rate limit handling: Batch requests (max 5 concurrent)
            const BATCH_SIZE = 5;
            for (let i = 0; i < fetchList.length; i += BATCH_SIZE) {
                const batch = fetchList.slice(i, i + BATCH_SIZE);
                await Promise.all(
                    batch.map(async (sym) => {
                        try {
                            const params: Record<string, unknown> = {};
                            if (sym) params.symbol = sym;

                            const data = await ports
                                .signedRequest<Record<string, unknown>>(
                                    "/api/tpsl",
                                    { exchange: "bitunix", action: view, params },
                                    undefined,
                                    buildTpslReadQueryParams(params),
                                )
                                .catch((e): Record<string, unknown> => {
                                    // Preserve rawMessage for classification if available
                                    const errMsg =
                                        e instanceof BitunixApiError && e.rawMessage
                                            ? e.rawMessage
                                            : e instanceof Error
                                              ? e.message
                                              : String(e);
                                    return { error: errMsg };
                                }); // Hardened

                            if (data.error) {
                                if (!String(data.error).includes("code: 2")) {
                                    // Symbol not found
                                    logger.warn(
                                        "market",
                                        `TP/SL fetch warning for ${sym}: ${data.error}`,
                                    );
                                }
                                return;
                            }
                            // BUG-0292: a Bitunix row carries both legs and
                            // names neither, so it has to be split into the
                            // one-plan-per-leg shape the store groups by.
                            // Pushing the raw rows through is what made
                            // `plansFor()` answer "no stop" for every
                            // position that had one.
                            const res = (Array.isArray(data) ? data : data.rows || []) as unknown[];
                            results.push(...normalizeTpSlRows(res));
                        } catch (e: unknown) {
                            logger.warn("market", `TP/SL network error for ${sym}`, e);
                        }
                    }),
                );
            }

            // Deduplicate
            const uniqueOrders = new Map<string, TpSlOrder>();
            results.forEach((o) => {
                // `orderId` first, deliberately (BUG-0292): after the split it
                // is the *leg* id, and the two legs of one row share the row's
                // `id`. Keying on `id` would collapse a take-profit and its
                // stop into one entry and drop whichever arrived first.
                const id = o.orderId || o.id || o.planId;
                if (id) uniqueOrders.set(String(id), o);
            });
            const final = Array.from(uniqueOrders.values());
            // Sort by time (newest first)
            final.sort(
                (a: TpSlOrder, b: TpSlOrder) =>
                    (b.ctime || b.createTime || 0) - (a.ctime || a.createTime || 0),
            );
            return final;
        }

        // Generic provider — live-Bitget never arrives here: its adapter
        // gates this read on SUPPORTS.tpSl (false) and resolves empty, so
        // no Bitunix-only envelope is ever signed with Bitget keys outside
        // paper mode, where the seam answers simulated.
        const data = await ports.signedRequest<Record<string, unknown>>(
            "/api/tpsl",
            { action: view },
            undefined,
            buildTpslReadQueryParams({}),
        );
        const list = (Array.isArray(data) ? data : data.rows || []) as TpSlOrder[];
        list.sort(
            (a: TpSlOrder, b: TpSlOrder) =>
                (b.ctime || b.createTime || 0) - (a.ctime || a.createTime || 0),
        );
        return list;
    }

    async function cancelTpSlOrder(order: TpSlOrder) {
        // `/api/tpsl` nests the order fields under `params`; the gate reads
        // symbol/orderId off the top level, so they are mirrored there. The
        // route ignores the extra keys.
        //
        // `sourceOrderId` first (BUG-0292): `orderId` on a normalised plan is
        // the leg id this app invented ("123-tp"), which the venue has never
        // heard of. The row id it was split from is the one that cancels
        // something. Falls back to `orderId` for plans that were never split —
        // the generic non-Bitunix path produces those.
        const orderId = order.sourceOrderId || order.orderId || order.id;
        return ports.gatedRequest({
            kind: "cancel",
            endpoint: "/api/tpsl",
            payload: {
                exchange: "bitunix",
                action: "cancel",
                symbol: order.symbol,
                orderId,
                params: {
                    orderId,
                    symbol: order.symbol,
                    planType: order.planType,
                },
            },
            displayed: { symbol: order.symbol, orderId },
        });
    }

    /**
     * Modifies one leg of an existing TP/SL order (BUG-0293).
     *
     * `POST /tpsl/modify_order` reads `tpPrice`/`slPrice` (at least one),
     * each with its own stop type, order type/price and quantity — the same
     * per-leg shape `placeTpSlOrder` sends, not a `planType`+`triggerPrice`
     * switch. It has no `symbol` parameter either; the order is identified by
     * `orderId` alone. This used to build a wire body the endpoint does not
     * document — `{orderId, symbol, planType, triggerPrice, qty}` — which
     * every call since it shipped sent, and which the venue's own "at least
     * one of tpPrice/slPrice" rule would reject.
     */
    async function modifyTpSlOrder(params: ModifyTpSlParams) {
        const wire: Record<string, unknown> = { orderId: params.orderId };
        if (params.planType === "PROFIT") {
            wire.tpPrice = params.triggerPrice;
            wire.tpStopType = params.stopType ?? "MARK_PRICE";
            if (params.qty !== undefined) wire.tpQty = params.qty;
        } else {
            wire.slPrice = params.triggerPrice;
            wire.slStopType = params.stopType ?? "MARK_PRICE";
            if (params.qty !== undefined) wire.slQty = params.qty;
        }

        return ports.gatedRequest({
            kind: "modify",
            endpoint: "/api/tpsl",
            payload: {
                exchange: "bitunix",
                action: "modify",
                symbol: params.symbol,
                orderId: params.orderId,
                params: wire,
            },
            // BUG-0663: the policy action is `modify-order`; the wire action
            // `modify` is not a catalogue member and would ask about nothing.
            // Attached only when the caller actually confirmed. The edit modal
            // shares this function and has no dialog yet — naming the policy
            // action on its requests would make the gate refuse them the
            // moment a user switches the toggle on, bricking the modal behind
            // a confirmation it cannot produce. That path stays exactly as
            // unconfirmed as it is today until it learns to ask.
            ...(params.confirmedAt !== undefined
                ? { confirmAs: "modify-order", confirmedAt: params.confirmedAt }
                : {}),
            displayed: {
                symbol: params.symbol,
                orderId: params.orderId,
                positionSide: params.context?.side.toUpperCase(),
                entryPrice: params.context?.entryPrice,
                tickSize: params.tickSize,
                // A PROFIT plan's trigger is a take-profit level, a LOSS
                // plan's is a stop — same field on the wire, different
                // meaning, and each has to land in the slot the gate checks.
                takeProfits:
                    params.planType === "PROFIT"
                        ? [new Decimal(params.triggerPrice)]
                        : undefined,
                stopLossPrice:
                    params.planType === "LOSS" ? new Decimal(params.triggerPrice) : undefined,
                // The quantity travels on the same leg it prices; the gate
                // compares it back against this (BUG-0505).
                takeProfitQty:
                    params.planType === "PROFIT" && params.qty !== undefined
                        ? new Decimal(params.qty)
                        : undefined,
                stopLossQty:
                    params.planType === "LOSS" && params.qty !== undefined
                        ? new Decimal(params.qty)
                        : undefined,
            },
            priceFields: {
                stopLoss: "params.slPrice",
                takeProfit: "params.tpPrice",
            },
            qtyFields: {
                takeProfit: "params.tpQty",
                takeProfitOrderType: "params.tpOrderType",
                stopLoss: "params.slQty",
                stopLossOrderType: "params.slOrderType",
            },
        });
    }

    /**
     * Creates the one position-wide TP/SL plan a position may carry
     * (FEAT-0070).
     *
     * Distinct from `placeTpSlOrder` below in what it protects: this plan
     * tracks the position's size, so a position that grows or shrinks stays
     * covered, and it closes at market. Bitunix allows exactly one per
     * position — a second create is refused there, which is why the caller
     * offers edit instead when one already exists.
     *
     * `kind: "modify"` rather than `"open"`: setting a stop reduces exposure
     * and must keep working while the kill switch is engaged, which is what
     * its own refusal message promises ("adjusting stops still work").
     */
    async function placePositionTpSl(params: PlacePositionTpSlParams) {
        if (!params.takeProfit && !params.stopLoss) {
            throw new Error("apiErrors.tpslNoLeg");
        }

        const wire: Record<string, unknown> = {
            symbol: params.symbol,
            positionId: params.positionId,
        };
        if (params.takeProfit) {
            wire.tpPrice = formatApiNum(params.takeProfit.price);
            wire.tpStopType = params.takeProfit.stopType ?? "MARK_PRICE";
        }
        if (params.stopLoss) {
            wire.slPrice = formatApiNum(params.stopLoss.price);
            wire.slStopType = params.stopLoss.stopType ?? "MARK_PRICE";
        }

        return ports.gatedRequest({
            kind: "modify",
            endpoint: "/api/tpsl",
            payload: {
                exchange: "bitunix",
                action: "place-position",
                symbol: params.symbol,
                params: wire,
            },
            displayed: {
                symbol: params.symbol,
                positionId: params.positionId,
                positionSide: params.context?.side.toUpperCase(),
                entryPrice: params.context?.entryPrice,
                tickSize: params.tickSize,
                takeProfits: params.takeProfit ? [params.takeProfit.price] : undefined,
                stopLossPrice: params.stopLoss?.price,
            },
            priceFields: {
                takeProfit: "params.tpPrice",
                stopLoss: "params.slPrice",
            },
        });
    }

    /**
     * Creates a partial TP/SL plan with an explicit quantity (FEAT-0070).
     *
     * Unlike the position-wide plan, several of these can coexist, and each
     * covers a fixed quantity rather than tracking the position. That is what
     * a scale-out ladder is made of.
     *
     * The quantity is the caller's, unrounded here: `closePosition` rounds
     * because it derives a quantity from a percentage, while this one is
     * handed a quantity the caller already decided. Rounding it again would
     * move a number the trader typed.
     */
    async function placeTpSlOrder(params: PlaceTpSlParams) {
        if (!params.takeProfit && !params.stopLoss) {
            throw new Error("apiErrors.tpslNoLeg");
        }

        const wire: Record<string, unknown> = {
            symbol: params.symbol,
            positionId: params.positionId,
        };
        if (params.takeProfit) {
            wire.tpPrice = formatApiNum(params.takeProfit.price);
            wire.tpQty = formatApiNum(params.takeProfit.qty);
            wire.tpStopType = params.takeProfit.stopType ?? "MARK_PRICE";
            wire.tpOrderType = params.takeProfit.orderType ?? "MARKET";
            if (params.takeProfit.orderPrice !== undefined) {
                wire.tpOrderPrice = formatApiNum(params.takeProfit.orderPrice);
            }
        }
        if (params.stopLoss) {
            wire.slPrice = formatApiNum(params.stopLoss.price);
            wire.slQty = formatApiNum(params.stopLoss.qty);
            wire.slStopType = params.stopLoss.stopType ?? "MARK_PRICE";
            wire.slOrderType = params.stopLoss.orderType ?? "MARKET";
            if (params.stopLoss.orderPrice !== undefined) {
                wire.slOrderPrice = formatApiNum(params.stopLoss.orderPrice);
            }
        }

        return ports.gatedRequest({
            kind: "modify",
            endpoint: "/api/tpsl",
            payload: {
                exchange: "bitunix",
                action: "place",
                symbol: params.symbol,
                params: wire,
            },
            displayed: {
                symbol: params.symbol,
                positionId: params.positionId,
                positionSide: params.context?.side.toUpperCase(),
                entryPrice: params.context?.entryPrice,
                tickSize: params.tickSize,
                takeProfits: params.takeProfit ? [params.takeProfit.price] : undefined,
                stopLossPrice: params.stopLoss?.price,
                // Fixed-quantity legs, compared back against the wire the
                // same way prices are (BUG-0505).
                takeProfitQty: params.takeProfit?.qty,
                stopLossQty: params.stopLoss?.qty,
            },
            priceFields: {
                takeProfit: "params.tpPrice",
                stopLoss: "params.slPrice",
            },
            qtyFields: {
                takeProfit: "params.tpQty",
                takeProfitOrderType: "params.tpOrderType",
                stopLoss: "params.slQty",
                stopLossOrderType: "params.slOrderType",
            },
        });
    }

    return {
        fetchTpSlOrders,
        cancelTpSlOrder,
        modifyTpSlOrder,
        placePositionTpSl,
        placeTpSlOrder,
    };
}
