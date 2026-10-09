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
 * Add lane — extracted from tradeService.ts (FEAT-0342).
 *
 * One method, verbatim: an opening order in the direction the position
 * already faces (FEAT-0334, `kind: "add"`, verified against the previewed
 * quantity plus available margin — never routed through `placeOrder`, whose
 * gate re-derives quantity from risk and stop). The position is re-read
 * before the payload is built. Everything it needs from the owner arrives
 * as a port; translation and toasts are the owner's job, exactly as in
 * ./accountSettings.
 */

import { Decimal } from "decimal.js";
import { formatApiNum } from "../../utils/utils";
import { TRADE_ERRORS } from "./tradeErrors";
import { newClientOrderId } from "./placeOrder";
import type { PlaceOrderParams } from "./tradeParams";
import type { PartialIntent } from "./payloadCodec";
import type { TradingPairInfo } from "../../stores/market/types";
import type { OMSPosition } from "../omsTypes";
import type { TpSlVenue } from "./tpSlService";

export interface AddToPositionParams {
    symbol: string;
    positionSide: "long" | "short";
    amount: Decimal;
    orderType?: "LIMIT" | "MARKET";
    price?: Decimal;
    effect?: PlaceOrderParams["effect"];
    clientId?: string;
    confirmedAt?: number;
}

export interface AddToPositionPorts {
    /** Fresh position or undefined; throws when the read itself fails. */
    ensurePositionFreshness(
        symbol: string,
        positionSide: "long" | "short",
    ): Promise<OMSPosition | undefined>;
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
    /** Raw account-size text; the lane parses it (owner-side, BUG-0508). */
    accountSizeText: () => string;
    /** When the venue last confirmed leverage and margin mode (owner-side). */
    remoteAccountStateAt: () => number | undefined;
    /** The position's resting stop, scoped by id (owner-side, BUG-0510). */
    restingStopPrice(
        symbol: string,
        side: "long" | "short",
        positionId?: string | null,
    ): Decimal | null;
}

export function createAddToPositionService(ports: AddToPositionPorts) {
    /**
     * Adds to an open position — FEAT-0334.
     *
     * An opening order in the direction the position already faces, so it
     * carries `tradeSide: "OPEN"` and never `reduceOnly`. It is *not* routed
     * through `placeOrder`: that path is for a risk-sized entry, and the gate
     * verifies its quantity by re-deriving it from account size, risk and stop
     * distance. An add has no new stop to divide by, so it travels as
     * `kind: "add"` and is verified against the quantity the panel previewed
     * plus available margin — see `OrderIntentKind` in `orderGate.ts`.
     *
     * The confirmation is `place-order`'s. An add is an order placement, and
     * FEAT-0024's catalogue already has a key for that; minting a second one
     * for a case the gate enforces structurally would dilute the catalogue
     * rather than tighten it.
     *
     * The position is re-read before the payload is built, so the size, entry
     * and mark the gate compares against are the venue's current figures and
     * not whatever the panel was showing when the trader started typing.
     */
    async function addToPosition(params: AddToPositionParams) {
        const { symbol, positionSide, amount } = params;
        const orderType = params.orderType ?? "MARKET";

        if (!amount || !amount.isFinite() || amount.lte(0)) {
            throw new Error("apiErrors.invalidAmount");
        }
        if (orderType === "LIMIT" && (!params.price || params.price.lte(0))) {
            throw new Error("apiErrors.invalidPrice");
        }

        // Fresh, not remembered: an add sized against a position that has
        // since been partly liquidated is an add against a different trade.
        const position = await ports.ensurePositionFreshness(symbol, positionSide);
        if (!position) {
            throw new Error(TRADE_ERRORS.POSITION_NOT_FOUND);
        }

        const clientId = params.clientId ?? newClientOrderId();
        const meta = ports.lookupSymbolMeta(symbol);

        /*
         * Where the add is expected to fill, used for the margin check only.
         * A limit add fills at its limit; a market add is estimated at the
         * mark, and where the venue omits the mark the entry is the closest
         * honest stand-in — an estimate that is stated, never one that is
         * silently zero.
         */
        const fillPrice =
            orderType === "LIMIT" && params.price
                ? params.price
                : position.markPrice && position.markPrice.gt(0)
                    ? position.markPrice
                    : position.entryPrice;

        // The settlement asset's free balance (USDT-M only), read for the
        // active mode only (BUG-0565) — see placeOrder above. This only
        // carries the reading — the refusal decision lives in `checkMargin`
        // (orderGate.ts), which refuses the add when the balance has not
        // loaded, since margin is its only ceiling (BUG-0511).
        const balanceForMode = ports.usdtBalance();
        const availableMargin = balanceForMode?.available;
        const availableMarginAt = balanceForMode?.at;

        // Account equity for the percentage position-size cap — the same
        // tradeState the order panel reads. Unparseable means the cap is
        // unmeasurable and the add refuses rather than passing unmeasured
        // (BUG-0508).
        let accountSize: Decimal | undefined;
        try {
            accountSize = new Decimal(ports.accountSizeText());
        } catch {
            accountSize = undefined;
        }

        const payload: Record<string, unknown> = {
            type: "place-order",
            symbol,
            // `side` names the direction of the exposure, the same convention
            // `buildCloseOrderFields` follows; `tradeSide` says whether it is
            // being opened or closed.
            side: positionSide === "long" ? "BUY" : "SELL",
            orderType,
            qty: formatApiNum(amount),
            price: orderType === "LIMIT" && params.price ? formatApiNum(params.price) : undefined,
            reduceOnly: false,
            clientId,
            effect: orderType === "MARKET" ? undefined : ports.effectFor(params.effect),
            tradeSide: "OPEN",
            positionId: position.positionId,
            // BUG-0597: direction implies the position side on opens.
            ...(ports.activeVenue() === "bitget"
              ? ports.bitgetUtaOpenFields(positionSide === "long" ? "BUY" : "SELL")
              : {}),
        };

        const result = await ports.gatedRequest({
            kind: "add",
            endpoint: "/api/orders",
            payload,
            confirmAs: "place-order",
            confirmedAt: params.confirmedAt,
            displayed: {
                symbol,
                side: positionSide === "long" ? "BUY" : "SELL",
                // The quantity the panel previewed and the trader agreed to.
                // The gate has no second way to derive this, which is exactly
                // why it is stated rather than recomputed.
                addQuantity: amount,
                entryPrice: fillPrice,
                positionAmount: position.amount,
                positionId: position.positionId,
                // For the percentage position-size cap (BUG-0508).
                accountSize,
                // The venue-reported average entry before the add, so the
                // gate measures the resulting position's stop risk from
                // displayed inputs rather than trusting constructor math.
                positionEntryPrice: position.entryPrice,
                // The position's resting stop when one is safely
                // attributable, so the loss-per-trade limit can measure the
                // add against the resulting position (BUG-0510). A dedicated
                // field: `stopLossPrice` would claim the request carries a
                // stop it never sends. Read from the cache, never fetched
                // here: the add dialog warms it before this can run, and a
                // fetch inside the order path would race the gate. Cold cache
                // means no stop known, which the limit treats as
                // unmeasurable, not unprotected. Scoped to this position by
                // id (BUG-0524) — in hedge mode the first LOSS leg is an
                // arbitrary side's stop.
                restingStopPrice: ports.restingStopPrice(symbol, positionSide, position.positionId) ?? undefined,
                leverage: position.leverage,
                marginMode: position.marginMode === "isolated" ? "ISOLATION" : "CROSS",
                availableMargin,
                availableMarginAt,
                /*
                 * When the venue last confirmed this account's leverage and
                 * margin mode. The gate refuses an add on a read older than
                 * MAX_ACCOUNT_STATE_AGE_MS, the same as it does an open,
                 * because an add opens exposure too.
                 *
                 * Read from `tradeState` — the same source `PlaceOrderPanel`
                 * hands to `placeOrder` — rather than stamped `Date.now()`
                 * here. Stamping it locally would satisfy the freshness check
                 * with the time this code ran instead of the time the exchange
                 * answered, which is a check that always passes and therefore
                 * is not a check.
                 */
                accountStateAt: ports.remoteAccountStateAt(),
                stepSize:
                    meta?.basePrecision !== undefined
                        ? new Decimal(10).pow(-meta.basePrecision)
                        : undefined,
                minTradeVolume: meta?.minTradeVolume ? new Decimal(meta.minTradeVolume) : undefined,
                maxLimitOrderVolume: meta?.maxLimitOrderVolume
                    ? new Decimal(meta.maxLimitOrderVolume)
                    : undefined,
                maxMarketOrderVolume: meta?.maxMarketOrderVolume
                    ? new Decimal(meta.maxMarketOrderVolume)
                    : undefined,
                symbolStatus: meta?.symbolStatus,
                isApiSupported: meta?.isApiSupported,
            },
        });

        return { clientId, result };
    }
    return { addToPosition };
}
