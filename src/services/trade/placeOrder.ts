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
/**
 * Open lane — extracted from tradeService.ts (FEAT-0342).
 *
 * One method, verbatim: a risk-sized entry with its stop and target in a
 * single request (FEAT-0069), so a position never exists unprotected. The
 * intent is `open`, the path on which the gate's size recomputation and the
 * risk limits apply. Everything it needs from the owner arrives as a port —
 * the gate for writes plus the store reads a service may not perform itself
 * (effect default, UTA open fields, instrument metadata, free balance).
 * Translation and toasts are the owner's job, exactly as in
 * ./accountSettings.
 *
 * `newClientOrderId` is pure and shared with `addToPosition`, which imports
 * it from here rather than minting a second scheme.
 */

import { Decimal } from "decimal.js";
import { formatApiNum } from "../../utils/utils";
import { roundDownToStep } from "../../lib/calculators/partialClose";
import type { PlaceOrderParams } from "./tradeParams";
import type { PartialIntent } from "./payloadCodec";
import type { TradingPairInfo } from "../../stores/market/types";
import type { TpSlVenue } from "./tpSlService";

/**
 * Generates the client order ID for one submission attempt.
 *
 * FEAT-0069's open question was whether this should be random per attempt
 * or derived deterministically so a crash-and-reload can rediscover an
 * in-flight order. Neither pure form works:
 *
 * - Purely random, regenerated on every retry, defeats the entire point.
 *   A retry after an ambiguous response is exactly when idempotency
 *   matters, and a fresh ID there doubles the order.
 * - Derived from the order's content collides on purpose. Two deliberate
 *   identical entries — the same symbol, side, size and price, which is
 *   ordinary when scaling in — would produce the same ID, and the second
 *   would be rejected as a duplicate of an order the trader meant to
 *   place.
 *
 * So the unit is the *attempt*, not the content: random per attempt, and
 * `placeOrder` accepts one back so a retry of that attempt reuses it.
 * Rediscovery after a crash comes from the FEAT-0015 audit trail, which
 * already persists the id alongside everything else about the attempt —
 * rather than from a second persistence mechanism that could disagree
 * with it.
 */
export function newClientOrderId(): string {
    // Bitunix caps clientId at 64 chars (07_trade.md); this is ~30.
    // Intentionally unguarded: exchange signing already requires crypto.subtle /
    // a secure context — see docs/adr/0013-client-side-exchange-signing.md.
    const stamp = Date.now().toString(36);
    const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    return `cachy-${stamp}-${rand}`;
}
export interface PlaceOrderPorts {
    /** The order gate. Every write goes through it — there is no other path. */
    gatedRequest: <T>(intent: PartialIntent) => Promise<T>;
    /** Time-in-force default; reads the venue capabilities (owner-side). */
    effectFor: (effect: PlaceOrderParams["effect"]) => PlaceOrderParams["effect"];
    /** UTA open fields; reads position mode and remote margin mode. */
    bitgetUtaOpenFields(direction: "BUY" | "SELL"): {
        posSide?: "LONG" | "SHORT";
        marginMode?: string;
    };
    /** The venue the UI is configured for; decides the intent envelope. */
    activeVenue(): TpSlVenue;
    /** Instrument metadata for the size guards, best-effort (owner-side). */
    lookupSymbolMeta(symbol: string): TradingPairInfo | undefined;
    /** Free-balance reading for the active mode (owner-side, BUG-0565). */
    usdtBalance: () => { available: Decimal; at: number } | undefined;
}

export function createPlaceOrderService(ports: PlaceOrderPorts) {
    /**
     * Opens or adds to a position — FEAT-0069.
     *
     * Everything the exchange accepts in one request goes in one request:
     * the entry, its stop and its target. A position that exists before its
     * protective orders do is unprotected for as long as the second request
     * takes, and that second request can fail.
     *
     * The intent is `open`, so this is the path on which the FEAT-0011 gate's
     * size recomputation, leverage and margin-mode checks, and FEAT-0013's
     * risk limits and kill switch all actually apply.
     */
    async function placeOrder(params: PlaceOrderParams) {
        const orderType = params.orderType ?? "MARKET";
        const clientId = params.clientId ?? newClientOrderId();
        const meta = params.symbol
            ? ports.lookupSymbolMeta(params.symbol)
            : undefined;

        // The venue fills whole multiples of the instrument's step, so a raw
        // calculator result that lands between steps is refused there — after
        // the user has already confirmed. Round down to the step before it
        // travels; the gate still refuses the volume limits (BUG-0380).
        const stepSize =
            params.displayed.stepSize ??
            (meta?.basePrecision !== undefined
                ? new Decimal(10).pow(-meta.basePrecision)
                : undefined);
        const qty = stepSize
            ? roundDownToStep(new Decimal(params.qty), stepSize)
            : params.qty;

        // formatApiNum everywhere: a price serialised as "1e-7" is rejected
        // by the exchange, and a native float here would undo the precision
        // the calculator spent effort producing.
        const payload: Record<string, unknown> = {
            type: "place-order",
            symbol: params.symbol,
            side: params.side,
            orderType,
            qty: formatApiNum(qty),
            price: params.price !== undefined ? formatApiNum(params.price) : undefined,
            reduceOnly: params.reduceOnly ?? false,
            clientId,
            // Omitted for MARKET by the route too; not sending it at all
            // keeps the audit record honest about what went out.
            effect: orderType === "MARKET" ? undefined : ports.effectFor(params.effect),
            tradeSide: params.tradeSide,
            positionId: params.positionId,
            // BUG-0597: direction implies the position side on opens.
            ...(ports.activeVenue() === "bitget"
              ? ports.bitgetUtaOpenFields(params.side)
              : {}),
        };

        if (params.takeProfit) {
            payload.tpPrice = formatApiNum(params.takeProfit.price);
            payload.tpStopType = params.takeProfit.stopType ?? "MARK_PRICE";
            payload.tpOrderType = params.takeProfit.orderType ?? "MARKET";
            if (params.takeProfit.orderPrice !== undefined) {
                payload.tpOrderPrice = formatApiNum(params.takeProfit.orderPrice);
            }
        }

        if (params.stopLoss) {
            payload.slPrice = formatApiNum(params.stopLoss.price);
            payload.slStopType = params.stopLoss.stopType ?? "MARK_PRICE";
            payload.slOrderType = params.stopLoss.orderType ?? "MARKET";
            if (params.stopLoss.orderPrice !== undefined) {
                payload.slOrderPrice = formatApiNum(params.stopLoss.orderPrice);
            }
        }

        // The free USDT balance the trader is spending from — read for the
        // active mode only (BUG-0565). Live wallet and the paper account
        // hydrate the same store, so an ambient read would measure against
        // whichever writer ran last. A mismatch (or no measurement at all)
        // hands the gate `undefined`, and the existing unmeasured path
        // engages (BUG-0511, recorded as `availableMarginUnmeasured`).
        // Settlement is currently USDT-M only, so USDT free is the whole
        // spendable balance until multi-collateral arrives.
        const balanceForMode = ports.usdtBalance();

        const result = await ports.gatedRequest({
            kind: "open",
            endpoint: "/api/orders",
            payload,
            origin: params.origin,
            displayed: {
                symbol: params.symbol,
                side: params.side,
                ...params.displayed,
                // Present, the gate measures the open's required margin
                // against it; absent or non-finite, it skips the measurement
                // as before (BUG-0511, recorded as
                // `availableMarginUnmeasured`). Stamped alongside the value
                // so the two can never disagree — the stamp itself is
                // informational, no gate consumes it as a freshness check:
                // a stale-high reading approves and the venue rejects, a
                // stale-low reading refuses early. Neither creates funds —
                // the venue stays final.
                availableMargin: balanceForMode?.available,
                availableMarginAt: balanceForMode?.at,
                stepSize,
                minTradeVolume: meta?.minTradeVolume ? new Decimal(meta.minTradeVolume) : undefined,
                maxLimitOrderVolume: meta?.maxLimitOrderVolume ? new Decimal(meta.maxLimitOrderVolume) : undefined,
                maxMarketOrderVolume: meta?.maxMarketOrderVolume ? new Decimal(meta.maxMarketOrderVolume) : undefined,
                symbolStatus: meta?.symbolStatus,
                isApiSupported: meta?.isApiSupported,
            },
        });

        // Returned so a caller retrying an ambiguous failure can reuse the
        // same id rather than minting a new one.
        return { clientId, result };
    }
    return { placeOrder };
}
