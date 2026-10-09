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
 * Single-close lane — extracted from tradeService.ts (FEAT-0342).
 *
 * One method, verbatim: partial or full close against a re-read position,
 * with the BUG-0062/0063 side contract shared via `buildCloseOrderFields`
 * (imported from ./flashClose, never duplicated) and the FEAT-0256
 * full-vs-partial distinction deciding whether the step-size rule applies.
 * Everything it needs from the owner arrives as a port; translation and
 * toasts are the owner's job, exactly as in ./accountSettings.
 */

import { Decimal } from "decimal.js";
import { logger } from "../logger";
import { TRADE_ERRORS } from "./tradeErrors";
import { buildCloseOrderFields } from "./flashClose";
import type { PartialIntent } from "./payloadCodec";
import type { TradingPairInfo } from "../../stores/market/types";
import type { OMSPosition } from "../omsTypes";
import type { TpSlVenue } from "./tpSlService";

export interface ClosePositionParams {
    symbol: string;
    positionSide: "long" | "short";
    amount?: Decimal;
    forceFullClose?: boolean;
}

export interface ClosePositionPorts {
    /** Fresh position or undefined; throws when the read itself fails. */
    ensurePositionFreshness(
        symbol: string,
        positionSide: "long" | "short",
    ): Promise<OMSPosition | undefined>;
    /** The order gate. Every write goes through it — there is no other path. */
    gatedRequest: <T>(intent: PartialIntent) => Promise<T>;
    /** UTA close fields; reads the remote margin mode and position mode. */
    bitgetUtaCloseFields(positionSide: "long" | "short"): {
        side: "BUY" | "SELL";
        posSide?: "LONG" | "SHORT";
        reduceOnly: boolean;
        marginMode?: string;
    };
    /** The venue the UI is configured for; decides the intent envelope. */
    activeVenue(): TpSlVenue;
    /** Instrument metadata for the size guards, best-effort (owner-side). */
    lookupSymbolMeta(symbol: string): TradingPairInfo | undefined;
    /** Duck-event fan-out for a closed trade (owner-side effects). */
    notifyTradeResult(kind: "trade_win" | "trade_loss", pnl: Decimal): void;
}

export function createClosePositionService(ports: ClosePositionPorts) {
    async function closePosition(params: ClosePositionParams) {
        const { symbol, positionSide, amount, forceFullClose } = params;

        // 1. Get fresh position
        const position = await ports.ensurePositionFreshness(symbol, positionSide);

        if (!position) {
            throw new Error(TRADE_ERRORS.POSITION_NOT_FOUND);
        }

        const { side, tradeSide, positionId } = buildCloseOrderFields(
            positionSide,
            position.positionId,
        );

        // Use explicit amount or full position amount
        // If explicit amount is provided, use it.
        if (!amount && !forceFullClose) {
             logger.error("market", `[ClosePosition] No amount specified and forceFullClose is false. Aborting close for ${symbol} ${positionSide}`);
             throw new Error("apiErrors.invalidAmount");
        }

        const qty = amount ? amount.toString() : position.amount.toString();

        // A close that names the full amount explicitly is still a full close.
        // `!amount` alone got this wrong for every caller that passes the size
        // it read off the position — which is what the positions panel does —
        // and the distinction now decides whether the gate applies its step-size
        // rule (FEAT-0256). Declaring a full close as partial would refuse an
        // exit from a position whose size is not a whole multiple of the current
        // step, i.e. lock the trader in.
        const closesEverything = !amount || amount.eq(position.amount);

        // Metadata is best-effort for the step size; the minimum is a
        // precondition for a partial close. A partial whose instrument
        // metadata never loaded states no minimum, and the gate refuses it
        // rather than approving an unmeasurable size (BUG-0509, BUG-0501).
        // Full closes stay exempt — a position under the minimum must still
        // be closable.
        const meta = ports.lookupSymbolMeta(symbol);
        const stepSize =
            meta?.basePrecision !== undefined
                ? new Decimal(10).pow(-meta.basePrecision)
                : undefined;

        logger.log("market", `[ClosePosition] Closing ${symbol} ${positionSide} (${qty})`);

        const pnlVal = position.unrealizedPnl ?? new Decimal(0);
        ports.notifyTradeResult(pnlVal.isNegative() ? "trade_loss" : "trade_win", pnlVal);

        return ports.gatedRequest({
            kind: "reduce",
            endpoint: "/api/orders",
            payload: {
                type: "place-order",
                symbol,
                side,
                orderType: "MARKET",
                qty,
                reduceOnly: true,
                tradeSide,
                positionId,
                // BUG-0597: UTA names the side it closes (transactional
                // direction + posSide). Bitunix keeps its convention untouched.
                ...(ports.activeVenue() === "bitget"
                  ? ports.bitgetUtaCloseFields(positionSide)
                  : {}),
            },
            displayed: {
                symbol,
                side,
                // The ceiling comes from the position re-read above, not from
                // the caller's `amount` — comparing the caller's number
                // against itself would prove nothing.
                positionAmount: position.amount,
                fullClose: closesEverything,
                stepSize,
                minTradeVolume: meta?.minTradeVolume ?? undefined,
                positionId,
            },
        });
    }
    return { closePosition };
}
