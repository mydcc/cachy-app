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
 * Modify-order lane — extracted from tradeService.ts (FEAT-0342).
 *
 * One method, verbatim: safe amend by re-reading the live order first
 * (AC 3), merging the caller's fields over it, and verifying the result
 * against the resting size (BUG-0548, BUG-0505) and the account equity
 * (BUG-0508). Everything it needs from the owner arrives as a port — the
 * gate for the write, the order-detail read, the venue, and the account-size
 * text a service may not read from the store itself
 * (eslint.architecture.boundaries.js).
 */

import { Decimal } from "decimal.js";
import { formatApiNum } from "../../utils/utils";
import { mismatch, OrderRefusedError } from "../orderGate";
import { TRADE_ERRORS } from "./tradeErrors";
import type { ModifyOrderParams } from "./tradeParams";
import type { NormalizedOrder } from "../../types/exchange";
import type { TpSlVenue } from "./tpSlService";
import type { PartialIntent } from "./payloadCodec";

export interface ModifyOrderPorts {
    /** Live order read; the amend is merged over it, never built blind. */
    getOrderDetail(orderId?: string, clientId?: string): Promise<NormalizedOrder>;
    /** The order gate. The amend goes through it — there is no other path. */
    gatedRequest: <T>(intent: PartialIntent) => Promise<T>;
    /** The venue the UI is configured for; decides the qty backfill. */
    activeVenue(): TpSlVenue;
    /** Account equity text for the percentage position-size cap. */
    accountSizeText(): string;
}

export interface ModifyOrderService {
    modifyOrder(params: ModifyOrderParams): Promise<unknown>;
}

export function createModifyOrderService(ports: ModifyOrderPorts): ModifyOrderService {
async function modifyOrder(params: ModifyOrderParams) {
    if (!params.orderId && !params.clientId) {
        throw new Error("Either orderId or clientId must be provided to modify order");
    }

    // AC 3: Safe Modify — Synchronous call to get_order_detail first
    const liveOrder = await ports.getOrderDetail(params.orderId, params.clientId);
    if (!liveOrder) {
        throw new Error(TRADE_ERRORS.ORDER_NOT_FOUND);
    }

    const symbol = params.symbol || liveOrder.symbol;

    /*
     * A quantity the caller did not ask for is not sent to Bitget. UTA's
     * modify takes qty and/or price, and whether its `qty` replaces or adds
     * is unverified — open question 6 in
     * `docs/bitget-api/15_uta_writes.md`. Under delta semantics a price-only
     * modify would inflate the order on every price step, and each step
     * would look correct to the caller; under replace semantics the field
     * was a no-op anyway. Omitting it is correct under both, so the
     * question does not have to be answered first to be safe.
     *
     * Bitunix keeps the backfill: its `modify_order` lists `qty` as
     * required and calls it an "exchange requirement" that Cachy satisfies
     * from the live order (`docs/bitunix-api/07_trade.md:529`), so a
     * price-only amend would be refused there.
     *
     * The position-size guards below still read `liveOrder.amount`
     * independently — a price change moves notional, so the cap has to be
     * measured against the resting size whether or not `qty` travels.
     */
    const qty =
        params.qty !== undefined
            ? formatApiNum(params.qty)
            : ports.activeVenue() === "bitget"
              ? undefined
              : liveOrder.amount;
    const price = params.price !== undefined ? formatApiNum(params.price) : (liveOrder.price || undefined);
    /*
     * A corrupt price is not a missing one, but it is equally
     * unverifiable: refuse typed (translated at the call site) instead of
     * letting `new Decimal` throw raw past the gate. A falsy venue price
     * stays "no entry given", as before.
     */
    let entryPrice: Decimal | undefined;
    const rawEntry = params.price !== undefined ? params.price : liveOrder.price;
    if (rawEntry) {
        let parsed: Decimal | undefined;
        try {
            const candidate = new Decimal(rawEntry);
            parsed = candidate.isFinite() ? candidate : undefined;
        } catch {
            parsed = undefined;
        }
        if (parsed === undefined) {
            throw new OrderRefusedError(mismatch(
                "entryPrice",
                "a readable price",
                String(rawEntry),
            ));
        }
        entryPrice = parsed;
    }

    const payload: Record<string, unknown> = {
        type: "modify-order",
        orderId: params.orderId || liveOrder.orderId,
        clientId: params.clientId || liveOrder.clientId,
        symbol,
        qty,
        price,
        tpPrice: params.tpPrice !== undefined ? formatApiNum(params.tpPrice) : (liveOrder.tpPrice || undefined),
        tpStopType: params.tpStopType || liveOrder.tpStopType,
        tpOrderType: params.tpOrderType || liveOrder.tpOrderType,
        slPrice: params.slPrice !== undefined ? formatApiNum(params.slPrice) : (liveOrder.slPrice || undefined),
        slStopType: params.slStopType || liveOrder.slStopType,
        slOrderType: params.slOrderType || liveOrder.slOrderType,
    };

    if (params.tpOrderPrice !== undefined) payload.tpOrderPrice = formatApiNum(params.tpOrderPrice);
    if (params.slOrderPrice !== undefined) payload.slOrderPrice = formatApiNum(params.slOrderPrice);

    // Account equity for the percentage position-size cap — the same
    // tradeState the order panel reads (BUG-0548). Unparseable means the
    // cap is unmeasurable and an enlarging amendment refuses rather than
    // passing unmeasured (BUG-0508).
    let accountSize: Decimal | undefined;
    try {
        const parsed = new Decimal(ports.accountSizeText());
        accountSize = parsed.isFinite() && parsed.gt(0) ? parsed : undefined;
    } catch {
        accountSize = undefined;
    }

    // The displayed side of a modify is what the caller asked for, before
    // formatApiNum() touched it. Comparing the formatted payload back
    // against the raw request is what catches a serialisation defect —
    // the exact failure mode that produced the float bug in the order
    // payload and the `response.json()`-corrupted order IDs.
    /*
     * Same fail-closed reading as entryPrice above, for the remaining
     * raw constructions in this hunk: a stated but corrupt level or
     * quantity refuses typed instead of throwing raw past the gate. An
     * absent quantity stays undefined — the gate refuses a stated
     * payload quantity without a displayed one as missing qty.inputs.
     */
    let stopLossPrice: Decimal | undefined;
    if (params.slPrice !== undefined) {
        try {
            const parsed = new Decimal(params.slPrice);
            stopLossPrice = parsed.isFinite() ? parsed : undefined;
        } catch {
            stopLossPrice = undefined;
        }
        if (stopLossPrice === undefined) {
            throw new OrderRefusedError(mismatch(
                "stopLoss",
                "a readable price",
                String(params.slPrice),
            ));
        }
    }
    let takeProfits: Decimal[] | undefined;
    if (params.tpPrice !== undefined) {
        let parsed: Decimal | undefined;
        try {
            const candidate = new Decimal(params.tpPrice);
            parsed = candidate.isFinite() ? candidate : undefined;
        } catch {
            parsed = undefined;
        }
        if (parsed === undefined) {
            throw new OrderRefusedError(mismatch(
                "takeProfit",
                "a readable price",
                String(params.tpPrice),
            ));
        }
        takeProfits = [parsed];
    }
    let modifyQuantity: Decimal | undefined;
    const rawQty = params.qty !== undefined ? params.qty : liveOrder.amount;
    if (rawQty !== undefined && rawQty !== null && rawQty !== "") {
        try {
            const parsed = new Decimal(rawQty);
            modifyQuantity = parsed.isFinite() ? parsed : undefined;
        } catch {
            modifyQuantity = undefined;
        }
        if (modifyQuantity === undefined) {
            throw new OrderRefusedError(mismatch(
                "modifyQuantity",
                "a readable quantity",
                String(rawQty),
            ));
        }
    }
    //
    // The size the order carried before this amendment — the gate only
    // knows an amendment enlarges exposure by comparing the new quantity
    // against this one (BUG-0548). A corrupt live reading must not throw
    // raw past the gate: undefined feeds the fail-closed increase path
    // instead.
    //
    // `amount` is the order's TOTAL size, not its resting remainder, and a
    // partial fill does not shrink it. Bitunix is verified: the mirror
    // documents `qty` as "Quantity (base coin)" and `tradeQty` as the
    // filled amount, and both examples hold `qty` at 1 while `tradeQty` is
    // 0.5 — one of them explicitly `PART_FILLED`
    // (docs/bitunix-api/07_trade.md). So `previousQuantity` is the
    // pre-amendment total either way.
    //
    // Which means the baseline must NOT be "hardened" by adding `filled`:
    // that would double-count the executed portion and push the baseline
    // above the real order size, making a genuine increase read as a
    // shrink more often than before, not less.
    //
    // Not verified, and deliberately not claimed: for Bitget this reads
    // `size` as the total, which the mirror does document — but the mirror
    // has no partial-fill example, so that Bitget keeps `size` across one
    // is read off the normalised payload, not off a spec. Bitget's wire
    // format is already flagged unverified in BUG-0580, and BUG-0589
    // records what the same gap costs on the sibling field: the Bitget
    // normaliser reads `filledQty`, which the mirror never mentions (it
    // documents `baseVolume`), so `NormalizedOrder.filled` is most likely
    // always "0" there. That does not reach this gate, which reads `amount`
    // and not `filled` — but it is why nothing above leans on `filled`.
    //
    // The live read still races the gate by construction — one round trip,
    // no user action in between — so the residual is accepted rather than
    // locked, and a stale-high reading fails toward the increase path. The
    // corrupt cases are handled rather than assumed: undefined, null, NaN,
    // infinite, zero and negative all route to the increase path in
    // `isQuantityIncreasingModify`.
    let liveAmount: Decimal | undefined;
    try {
        liveAmount = new Decimal(liveOrder.amount);
    } catch {
        liveAmount = undefined;
    }
    return await ports.gatedRequest({
        kind: "modify",
        endpoint: "/api/orders",
        payload,
        displayed: {
            symbol: typeof symbol === "string" ? symbol : undefined,
            orderId: params.orderId,
            entryPrice,
            positionSide: liveOrder.side,
            stopLossPrice,
            takeProfits,
            // The quantity the caller asked for, or the live order read
            // this request was merged with — the gate compares the
            // payload back against it (BUG-0505).
            modifyQuantity,
            // The size the resting order had before this amendment — the
            // gate only knows an amendment enlarges exposure by comparing
            // the new quantity against this one (BUG-0548).
            previousQuantity: liveAmount,
            accountSize,
        },
    });
}

    return { modifyOrder };
}
