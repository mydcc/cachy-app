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
 * Placing an entry and its protection as one unit — FEAT-0021.
 *
 * The calculator already knows the size, the stop and the targets. This turns
 * that into orders and, more importantly, answers the item's open question:
 * what happens when the entry fills and the stop does not.
 *
 * **The entry is never automatically closed.** FEAT-0013 already settled the
 * principle for the kill switch — "an automatic liquidation triggered by a
 * panic button is a way to turn a scare into a loss" — and it holds at least
 * as strongly here, where the trigger would be a failed *second* request
 * rather than a deliberate act. Closing on our own initiative realises a loss
 * the trader never chose, on the strength of an error that may be transient.
 *
 * What happens instead: the stop is retried, and if it still is not there the
 * position is reported as UNPROTECTED, loudly. The item is explicit that a
 * stop which failed to attach "must be surfaced loudly, not logged", so the
 * caller gets a result object it cannot ignore rather than a log line it can.
 *
 * Verification is separate from placement, and that matters: Bitunix's
 * place_order response returns only an order id, and says nothing about
 * whether the attached tpPrice/slPrice actually became plans. So after an
 * entry with protection attached, this re-reads the plans (FEAT-0057's cache)
 * and checks. An atomic request that silently dropped the stop looks exactly
 * like a successful one until someone looks.
 */

import { Decimal } from "decimal.js";
import { tradeService } from "./tradeService";
import { tpSlState } from "../stores/tpsl.svelte";
import { capabilitiesOf, type OrderEntryType, type TimeInForce } from "./exchangeCapabilities";
import { logger } from "./logger";
import { OrderRefusedError, type OrderRefusal } from "./orderGate";
import { getDisplayMessage } from "../utils/errorUtils";

export type ProtectionState =
    /** Rode along with the entry and was confirmed present afterwards. */
    | "attached"
    /** Placed as a separate order after the entry, and confirmed. */
    | "placed"
    /** Not requested by the trader. */
    | "none"
    /** Requested, and NOT there. The position is unprotected. */
    | "failed";

export interface PlacementResult {
    /** False when nothing was sent — a refusal or a rejected entry. */
    entryPlaced: boolean;
    /** The attempt id, so a caller can retry this attempt idempotently. */
    clientId?: string;
    stopLoss: ProtectionState;
    takeProfit: ProtectionState;
    /**
     * True when the entry exists and the stop does not. The single state this
     * whole module exists to make impossible to miss.
     */
    unprotected: boolean;
    /** i18n key describing what went wrong, when something did. */
    errorKey?: string;
    /**
     * The gate's refusal, whole, when the gate is what stopped this.
     *
     * `errorKey` alone is not enough to render one: the `orderGate.*` messages
     * name the field and the numbers that disagreed, and a caller translating
     * the bare key shows the trader raw `{field}` placeholders. Render this
     * with `translateRefusal` (or `getDisplayMessage`) instead.
     */
    refusal?: OrderRefusal;
    /** Untranslated detail from the exchange, for the error surface. */
    errorDetail?: string;
}

export interface EntryPlan {
    exchange: string;
    symbol: string;
    /** "long" or "short", as the calculator states it. */
    tradeType: string;
    entryType: OrderEntryType;
    qty: Decimal;
    entryPrice: Decimal;
    stopLossPrice: Decimal;
    /** Ordered targets from the calculator. Only the first can ride along. */
    takeProfits: Decimal[];
    accountSize: Decimal;
    riskPercentage: Decimal;
    leverage?: Decimal;
    marginMode?: string;
    accountStateAt?: number;
    timeInForce?: TimeInForce;
}

/** How many times a missing stop is re-placed before it is called failed. */
export const STOP_RETRY_ATTEMPTS = 2;

/**
 * Wait between retries. Bitunix attaches a bracket TP/SL to a just-filled
 * entry as a separate, asynchronous step on its side — observed to take a
 * couple of seconds. Retrying immediately raced that step and always lost,
 * turning a genuinely-protected position into a false "unprotected" alarm.
 */
export const STOP_RETRY_DELAY_MS = 1200;

class OrderPlacementService {
    /**
     * Places the entry together with whatever protection the exchange
     * supports, then verifies the protection actually exists.
     */
    public async placeEntryGroup(plan: EntryPlan): Promise<PlacementResult> {
        const caps = capabilitiesOf(plan.exchange);
        const side: "BUY" | "SELL" = plan.tradeType === "short" ? "SELL" : "BUY";
        const wantsStop = plan.stopLossPrice.gt(0);
        const wantsTarget = plan.takeProfits.length > 0;

        const attach = caps.tpSlAtEntry;

        /*
         * Time in force, against what the venue declares (FEAT-0017).
         *
         * Only GTC is dropped when the venue takes none. It is the neutral
         * default — good-till-cancelled *is* what an order does with no
         * constraint attached — and the panel rests there, so dropping it
         * changes nothing about the order. Without this, Bitget (which
         * declares an empty list) would have every limit order refused by the
         * gate over a default nobody chose.
         *
         * IOC, FOK and POST_ONLY are not dropped. Each one changes how the
         * order executes, and quietly sending "no constraint" instead would
         * give the trader a different order than the one they asked for —
         * a POST_ONLY that becomes a taker fill costs money. It goes through
         * unchanged and the gate refuses it, loudly, which is the outcome
         * worth having.
         */
        const effect = (() => {
            if (plan.timeInForce === undefined) return undefined;
            if (caps.timeInForce.includes(plan.timeInForce)) return plan.timeInForce;
            return plan.timeInForce === "GTC" ? undefined : plan.timeInForce;
        })();

        let clientId: string | undefined;
        try {
            const submitted = await tradeService.placeOrder({
                symbol: plan.symbol,
                side,
                orderType: plan.entryType === "market" ? "MARKET" : "LIMIT",
                qty: plan.qty,
                price: plan.entryType === "market" ? undefined : plan.entryPrice,
                effect: plan.entryType === "market" ? undefined : effect,
                takeProfit:
                    attach && wantsTarget ? { price: plan.takeProfits[0] } : undefined,
                stopLoss: attach && wantsStop ? { price: plan.stopLossPrice } : undefined,
                displayed: {
                    accountSize: plan.accountSize,
                    riskPercentage: plan.riskPercentage,
                    entryPrice: plan.entryPrice,
                    stopLossPrice: plan.stopLossPrice,
                    takeProfits:
                        attach && wantsTarget ? [plan.takeProfits[0]] : undefined,
                    leverage: plan.leverage,
                    marginMode: plan.marginMode,
                    accountStateAt: plan.accountStateAt,
                },
            });
            clientId = submitted.clientId;
        } catch (e) {
            // Nothing was sent, so nothing is unprotected. A refusal is the
            // gate doing its job and is reported as itself, not as a failure.
            return {
                entryPlaced: false,
                stopLoss: "none",
                takeProfit: "none",
                unprotected: false,
                errorKey:
                    e instanceof OrderRefusedError
                        ? e.refusal.messageKey
                        : "orderEntry.errors.entryRejected",
                refusal: e instanceof OrderRefusedError ? e.refusal : undefined,
                // `getDisplayMessage`, not `e.message`: BitunixApiError puts the
                // i18n key "apiErrors.generic" in `message` and the exchange's
                // own text — the only thing that says *why* the order failed —
                // in `rawMessage`. Reading `message` threw that away and showed
                // the trader the key instead.
                errorDetail: getDisplayMessage(e),
            };
        }

        // From here the entry exists. Everything below is about whether it is
        // protected, and no failure below may undo it.
        if (!wantsStop && !wantsTarget) {
            return {
                entryPlaced: true,
                clientId,
                stopLoss: "none",
                takeProfit: "none",
                unprotected: false,
            };
        }

        const confirmed = await this.confirmProtection(plan, {
            wantsStop,
            wantsTarget,
            attached: attach,
        });

        return { entryPlaced: true, clientId, ...confirmed };
    }

    /**
     * Checks that the protection the trader asked for is actually on the
     * exchange, retrying a missing stop before giving up on it.
     *
     * The response to `place_order` carries an order id and nothing about the
     * attached levels, so "the request succeeded" is not evidence the stop
     * exists. This looks.
     */
    private async confirmProtection(
        plan: EntryPlan,
        want: { wantsStop: boolean; wantsTarget: boolean; attached: boolean },
    ): Promise<Omit<PlacementResult, "entryPlaced" | "clientId">> {
        const settled = want.attached ? "attached" : "placed";

        for (let attempt = 0; attempt <= STOP_RETRY_ATTEMPTS; attempt++) {
            const plans = await this.readPlans(plan.symbol);
            const haveStop = plans.loss !== undefined;
            const haveTarget = plans.profit !== undefined;

            const stopSettled = !want.wantsStop || haveStop;
            const targetSettled = !want.wantsTarget || haveTarget;

            if (stopSettled && targetSettled) {
                return {
                    stopLoss: want.wantsStop ? (settled as ProtectionState) : "none",
                    takeProfit: want.wantsTarget ? (settled as ProtectionState) : "none",
                    unprotected: false,
                };
            }

            // A missing stop is worth another attempt; a missing target is
            // not urgent enough to spend requests on mid-placement.
            if (!stopSettled && attempt < STOP_RETRY_ATTEMPTS) {
                logger.warn(
                    "market",
                    `[Placement] Stop not present for ${plan.symbol}, retry ${attempt + 1}/${STOP_RETRY_ATTEMPTS}`,
                );
                await this.replaceStop(plan);
                await new Promise((resolve) => setTimeout(resolve, STOP_RETRY_DELAY_MS));
                continue;
            }

            return {
                stopLoss: want.wantsStop
                    ? haveStop
                        ? (settled as ProtectionState)
                        : "failed"
                    : "none",
                takeProfit: want.wantsTarget
                    ? haveTarget
                        ? (settled as ProtectionState)
                        : "failed"
                    : "none",
                // The position exists and its stop does not. Everything about
                // this result is arranged so a caller cannot render it as a
                // success.
                unprotected: want.wantsStop && !haveStop,
                errorKey:
                    want.wantsStop && !haveStop
                        ? "orderEntry.errors.unprotected"
                        : "orderEntry.errors.targetMissing",
            };
        }

        // Unreachable: the loop returns on every path.
        return { stopLoss: "failed", takeProfit: "failed", unprotected: true };
    }

    /** Re-reads the exchange's plans for a symbol, bypassing the cache window. */
    private async readPlans(symbol: string) {
        tpSlState.invalidate();
        await tpSlState.ensureFresh();
        return tpSlState.plansFor(symbol);
    }

    /**
     * Places a stop on its own, for the retry path and for exchanges that
     * cannot attach one at entry.
     *
     * Bitunix's `tpsl/place_order` is not integrated yet — that is
     * FEAT-0070 — so there is currently nothing to call. Rather than pretend
     * otherwise, this records the gap and lets the caller reach the
     * UNPROTECTED result, which is the honest outcome: the retry could not be
     * performed, so the stop is not there.
     */
    private async replaceStop(plan: EntryPlan): Promise<void> {
        logger.error(
            "market",
            `[Placement] Cannot re-place stop for ${plan.symbol}: tpsl/place_order is not integrated (FEAT-0070)`,
        );
    }
}

export const orderPlacementService = new OrderPlacementService();
