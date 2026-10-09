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
 * Flash-close lane — extracted from tradeService.ts (FEAT-0342).
 *
 * One method, verbatim: optimistic full-close with rollback and
 * close-then-cancel ordering (BUG-0331, BUG-0586). Everything it needs from
 * the owner arrives as a port — the gate for writes, the account half, the
 * freshness read, the cancel lane, and the handful of store reads a service
 * may not perform itself (eslint.architecture.boundaries.js). Translation
 * and toasts are the owner's job, exactly as in ./accountSettings.
 *
 * `buildCloseOrderFields` is pure and shared with `closePosition`, which
 * still lives on the owner and imports it from here. The store-reading
 * `bitgetUtaCloseFields` stays on the owner and arrives as a port until its
 * last consumer moves.
 */

import { Decimal } from "decimal.js";
import { omsService } from "../omsService";
import { logger } from "../logger";
import { RetryPolicy } from "../../utils/retryPolicy";
import { orderGate, translateRefusal, OrderRefusedError } from "../orderGate";
import { BitunixApiError, TRADE_ERRORS } from "./tradeErrors";
import type { OMSOrderSide } from "../omsTypes";
import type { OMSPosition } from "../omsTypes";
import type { DuckTriggerEvent } from "../../lib/pets/types";
import type { TpSlVenue } from "./tpSlService";
import {
    completeIntent,
    type AccountHalf,
    type PartialIntent,
} from "./payloadCodec";

export interface FlashClosePorts {
    /** The order gate. Every write goes through it — there is no other path. */
    gatedRequest: <T>(intent: PartialIntent) => Promise<T>;
    /** The account half of the displayed state; the intent builder needs it. */
    displayedAccount(): AccountHalf;
    /** Fresh position or undefined; throws when the read itself fails. */
    ensurePositionFreshness(
        symbol: string,
        positionSide: "long" | "short",
    ): Promise<OMSPosition | undefined>;
    /** UTA close fields; reads the remote margin mode and position mode. */
    bitgetUtaCloseFields(positionSide: "long" | "short"): {
        side: "BUY" | "SELL";
        posSide?: "LONG" | "SHORT";
        reduceOnly: boolean;
        marginMode?: string;
    };
    /** The cancel-all lane; cleanup after the close, never before it. */
    cancelAllOrders(
        symbol: string | undefined,
        throwOnError: boolean,
        onBehalfOf?: { action: string; confirmedAt?: number },
    ): Promise<unknown> | undefined;
    /** Provider refresh for the post-failure recovery sync. */
    refreshPositionsForProvider(): Promise<void>;
    /** The venue the UI is configured for; decides the intent envelope. */
    activeVenue(): TpSlVenue;
    /** Last price for optimistic UI feedback; zero when unknown. */
    lastPrice(symbol: string): Decimal;
    /** Fill notification; the pet duck lives in a store. */
    triggerDuckEvent(event: DuckTriggerEvent): void;
    /** Locale lookup; translation is the owner's job. */
    t(key: string, options?: { values?: Record<string, string> }): string;
    /** Failure toast; composed and shown by the owner. */
    notifyFailure(message: string): void;
}

export interface FlashCloseService {
    flashClosePosition(
        symbol: string,
        positionSide: "long" | "short",
        confirmedAt?: number,
    ): Promise<{ success: true; data: unknown } | { success: false; error: string }>;
}

/**
 * Bitunix close-payload fields. Pure — moved here with the flash-close lane
 * and shared with `closePosition`, which imports it rather than duplicating
 * the BUG-0062/0063 contract documented below.
 */
/**
 * Bitunix's place_order/batch_order docs (docs/bitunix-api/07_trade.md:
 * 32/583) list `tradeSide` as unconditionally `Required: true` — the
 * "nur im Hedge-Modus erforderlich" wording only describes when the
 * value matters for disambiguation, not when the field may be omitted.
 * BUG-0062 trusted the wording and only sent `tradeSide`/`positionId`
 * when `positionMode === "hedge"`, falling back to the old
 * inverted-`side`-only shape otherwise — confirmed live (BUG-0063) that
 * this fallback still 500s with "must not be null" on a ONE_WAY
 * account, so it was never a working shape to begin with. `positionId`
 * is documented as required whenever `tradeSide = CLOSE`, again with no
 * Hedge-only qualifier, so it's sent unconditionally too. `side`
 * matches the position's own side (BUY closes a long, SELL closes a
 * short) per the documented request example — not inverted — since
 * `tradeSide`/`positionId` now carry the open/close and which-position
 * disambiguation in all modes.
 */
export function buildCloseOrderFields(
    positionSide: "long" | "short",
    positionId: string | undefined,
): { side: "BUY" | "SELL"; tradeSide: "CLOSE"; positionId?: string } {
    return {
        side: positionSide === "long" ? "BUY" : "SELL",
        tradeSide: "CLOSE",
        positionId,
    };
}

export function createFlashCloseService(ports: FlashClosePorts): FlashCloseService {
/**
 * @param confirmedAt When the user confirmed, as `Date.now()` — FEAT-0024.
 *   Omitted when no confirmation was needed. If the policy requires one and
 *   this is absent, the gate refuses rather than sending: a caller that
 *   forgets to ask stops, it does not proceed silently.
 */
async function flashClosePosition(
    symbol: string,
    positionSide: "long" | "short",
    confirmedAt?: number,
): Promise<{ success: true; data: unknown } | { success: false; error: string }> {
    let clientOrderId = "";
    try {
        // 1. Get fresh position
        const position = await ports.ensurePositionFreshness(symbol, positionSide);

        if (!position) {
            throw new Error(TRADE_ERRORS.POSITION_NOT_FOUND);
        }

        // 2. Execute Close
        // True execution direction, for local optimistic-order bookkeeping
        // only — the API payload's own `side` matches the position side
        // instead (not inverted); see buildCloseOrderFields.
        const side: OMSOrderSide = positionSide === "long" ? "sell" : "buy";
        const { side: apiSide, tradeSide, positionId } = buildCloseOrderFields(
            positionSide,
            position.positionId,
        );

        // CRITICAL: Use exact amount from OMS
        if (!position.amount || position.amount.isZero() || position.amount.isNegative()) {
            logger.error("market", `[FlashClose] Invalid position amount: ${position.amount}`, position);
            throw new Error("apiErrors.invalidAmount");
        }

        const qty = position.amount.toString();

        logger.log("market", `[FlashClose] Closing ${symbol} ${positionSide} (${qty})`);

        // Retrieve current market price for optimistic UI feedback
        const currentPrice = ports.lastPrice(symbol);

        /*
         * Minted before the intent because the generic payload carries it,
         * but NOT yet assigned to `clientOrderId`: that variable is the
         * catch block's signal that an optimistic order exists and needs
         * rolling back. Assigning it here would send the recovery path
         * chasing an order that was never added.
         */
        // Intentionally unguarded: exchange signing already requires crypto.subtle /
        // a secure context — see docs/adr/0013-client-side-exchange-signing.md.
        const candidateOrderId = "opt-" + crypto.randomUUID().replace(/-/g, "").slice(0, 28);

        const provider = ports.activeVenue();
        const intent: PartialIntent =
            provider === "bitunix" && position.positionId
                ? {
                      kind: "reduce",
                      endpoint: "/api/orders",
                      payload: {
                          type: "flash-close-position",
                          symbol,
                          positionId: position.positionId,
                      },
                      displayed: { symbol, positionId: position.positionId },
                      confirmAs: "flash-close-position",
                      confirmedAt,
                  }
                : {
                      kind: "reduce",
                      endpoint: "/api/orders",
                      payload: {
                          type: "place-order",
                          symbol,
                          side: apiSide,
                          orderType: "MARKET",
                          qty,
                          reduceOnly: true,
                          clientOrderId: candidateOrderId,
                          tradeSide,
                          positionId,
                          // BUG-0597: UTA names the side it closes. Bitunix
                          // keeps the position-side convention untouched.
                          // Single read: `provider` above is the venue this
                          // intent is built for — a second port read here
                          // could disagree with it if the setting changed
                          // mid-flight and mix the envelopes.
                          ...(provider === "bitget"
                            ? ports.bitgetUtaCloseFields(positionSide)
                            : {}),
                      },
                      displayed: {
                          symbol,
                          side: apiSide,
                          positionAmount: position.amount,
                          fullClose: true,
                          positionId,
                      },
                      /*
                       * The payload says `place-order` because that is what
                       * this venue understands, but the user pressed flash
                       * close and that is the policy they configured.
                       * Without this the prompt would appear on Bitunix and
                       * not on Bitget — a difference no user asked for.
                       */
                      confirmAs: "flash-close-position",
                      confirmedAt,
                  };

        /*
         * BUG-0331. Verified BEFORE anything below has a side effect.
         *
         * The cancel further down removes this position's stop-loss and
         * take-profit, which is right when the close then happens and
         * dangerous when it does not: a refusal afterwards leaves the
         * trader holding an open position with its protection gone, at the
         * moment they were trying to get out. That is strictly worse than
         * the state they started in, and it applied to every refusal the
         * gate can issue — the kill switch, a risk limit, a price
         * mismatch, a stale account read, an unsupported venue.
         *
         * `verify` is pure and documented as safe to call twice, so asking
         * here costs nothing and changes nothing: `gatedRequest` still runs
         * the same verification, and this cannot approve anything the gate
         * would refuse. It only moves the refusal to before the damage.
         */
        orderGate.verifyOrThrow(completeIntent(intent, ports.displayedAccount()));

        // Past this line the function has side effects to undo on failure.
        clientOrderId = candidateOrderId;

        // OPTIMISTIC UPDATE
        omsService.addOptimisticOrder({
            id: clientOrderId,
            clientOrderId,
            symbol,
            side: side,
            type: "market",
            status: "pending",
            price: currentPrice,
            amount: position.amount,
            filledAmount: new Decimal(0),
            timestamp: Date.now(),
            _isOptimistic: true
        });

        /*
         * BUG-0586 (product decision 2026-10-05: close-then-cancel). The
         * close is dispatched BEFORE the resting stops are cancelled, so
         * a refusal from `gatedRequest` — risk limits, kill switch, or
         * the dispatch guard's session check — lands while the position
         * is still protected: the cancel below never runs, and the catch
         * removes the optimistic order as terminal (a refusal never
         * leaves the device, so there is nothing to reconcile).
         *
         * Residual risk, accepted with the decision: a stop placed after
         * the dispatch and before the cancel can fill against the close,
         * and in hedge mode that fill opens a reverse position rather
         * than flattening one. That window is inherent to close-first;
         * the alternative (cancel-first) left a refused close open AND
         * unprotected, which is strictly worse at the moment the trader
         * was trying to get out.
         */
        const result = await ports.gatedRequest(intent);

        /*
         * Cleanup AFTER the close. A resting stop that survives the fill
         * would otherwise stay live on a flat position — or fight the
         * next entry on the symbol.
         *
         * Carries the flash close's own authorisation: `cancel-all`
         * confirms by default, and without this the gate refuses a cleanup
         * the user already agreed to when they confirmed the close.
         *
         * A cancel failure here must not fail the close: the position is
         * already flat, so this is a cleanup problem, not an execution
         * one. It is logged CRITICAL because resting stops may still be
         * live and need the trader's attention.
         */
        try {
            await ports.cancelAllOrders(symbol, true, {
                action: "flash-close-position",
                confirmedAt,
            });
        } catch (cancelError) {
            logger.error("market", `[FlashClose] CRITICAL: Close succeeded but failed to cancel open orders for ${symbol}. Resting stops may still be live.`, cancelError);
        }

        const pnlVal = position.unrealizedPnl ?? new Decimal(0);
        ports.triggerDuckEvent({
            type: pnlVal.isNegative() ? "trade_loss" : "trade_win",
            pnl: pnlVal,
        });

        return { success: true, data: result };

    } catch (e: unknown) {
        // Use rawMessage for display when available (human-readable API text),
        // fall back to e.message for non-API errors (e.g. "tradeErrors.positionNotFound").
        // A gate refusal (FEAT-0011) names the field that disagreed and
        // is already translatable, so it wins over both.
        const msg = e instanceof OrderRefusedError
            ? translateRefusal(e.refusal, ports.t)
            : (e instanceof BitunixApiError && e.rawMessage) ? e.rawMessage : (e instanceof Error ? e.message : String(e));

        // Handle Optimistic Order Rollback/Recovery
        if (clientOrderId) {
            logger.warn("market", `[FlashClose] Request failed. Handling optimistic order ${clientOrderId}.`, e);

            const isApiErr = (err: unknown): err is { status?: number, code?: string } =>
                typeof err === "object" && err !== null && ("status" in err || "code" in err);

            const isTerminalError =
                // BUG-0586: a refusal is raised *before* the bytes leave —
                // the gate's own checks, and the dispatch guard's
                // `beforeAttempt` hook, both run ahead of `fetch`. So this
                // is not an unknown outcome to be reconciled later; the
                // venue never saw it. Classifying it as indeterminate
                // parked the close in the OMS as `_isUnconfirmed`, which
                // reads as "a close is out there we cannot see" for a
                // request that provably did not go out.
                (e instanceof OrderRefusedError) ||
                (e instanceof BitunixApiError) ||
                (e instanceof Error && (
                    e.message.includes("400") ||
                    e.message.includes("401") ||
                    e.message.includes("403") ||
                    (isApiErr(e) && e.code === "VALIDATION_ERROR") ||
                    (isApiErr(e) && e.status === 400) ||
                    (isApiErr(e) && e.status === 401) ||
                    (isApiErr(e) && e.status === 403)
                ));

            if (isTerminalError) {
                 logger.warn("market", `[FlashClose] Definitive API Failure. Removing optimistic order.`);
                 omsService.removeOrder(clientOrderId);
            } else {
                 // Indeterminate state (Timeout / Network Error)
                 const order = omsService.getOrder(clientOrderId);
                 if (order) {
                     order._isUnconfirmed = true;
                     omsService.updateOrder(order);
                 }
            }

            // Trigger background sync
            (async () => {
                try {
                    await RetryPolicy.execute(() => ports.refreshPositionsForProvider(), {
                        maxAttempts: 5,
                        initialDelayMs: 500,
                        maxDelayMs: 5000,
                        name: "FlashClose Recovery Sync"
                    });
                } catch (err) {
                    logger.error("market", `[FlashClose] CRITICAL: All recovery sync attempts failed.`, err);
                }
            })();
        }

        // [FIX] Notify User & Prevent Crash
        logger.error("market", `[FlashClose] Failed: ${msg}`, e);
        ports.notifyFailure(msg);

        // Return failure object instead of throwing
        return { success: false, error: msg };
    }
}

    return { flashClosePosition };
}
