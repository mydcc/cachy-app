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
import { tradeService, type TpSlOrder } from "./tradeService";
import { accountState } from "../stores/account.svelte";
import { tpSlState } from "../stores/tpsl.svelte";
import { capabilitiesOf, type OrderEntryType, type TimeInForce } from "./exchangeCapabilities";
import { logger } from "./logger";
import { OrderRefusedError, type OrderRefusal, type OrderOrigin } from "./orderGate";
// Shared with the resting-stop read (review on PR #3551) so the two cannot drift.
import { planSideMatchesEntry as sideCompatible } from "./tpslNormalize";
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
    /**
     * Where the order came from. Required, not optional-with-default, so a
     * new call site cannot omit it and silently take the live path
     * (BUG-0494): the gate and the transport refuse a bot-stamped plan while
     * paper trading is off instead of falling through to the venue.
     */
    origin: OrderOrigin;
    /** "long" or "short", as the calculator states it. */
    tradeType: "long" | "short";
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

/** How often replaceStop looks for the fresh position's id before giving up. */
const POSITION_ID_POLLS = 3;
/** Pause between position-id polls; requestSync is fire-and-forget. */
const POSITION_ID_POLL_MS = 300;

/** Total fake-clock budget re-placement may spend polling for the position id. */
export const POSITION_ID_RESOLVE_BUDGET_MS =
    (POSITION_ID_POLLS - 1) * POSITION_ID_POLL_MS;

/** How many times a missing stop is re-placed before it is called failed. */
export const STOP_RETRY_ATTEMPTS = 2;

/**
 * Wait between retries. Bitunix attaches a bracket TP/SL to a just-filled
 * entry as a separate, asynchronous step on its side — observed to take a
 * couple of seconds. Retrying immediately raced that step and always lost,
 * turning a genuinely-protected position into a false "unprotected" alarm.
 */
export const STOP_RETRY_DELAY_MS = 1200;

/*
 * BUG-0502 — identity for the protection check.
 *
 * `plansFor` answers "show me what is on this symbol" for cards. Confirming
 * a placement must answer "did my request take effect", which needs more
 * than existence: a pre-existing plan on the same symbol, one at the wrong
 * price, or one belonging to the opposite side must never settle the check.
 * A candidate only counts when it is new (absent from the before-image),
 * priced as requested, and side-compatible.
 */

function planIdOf(order: TpSlOrder): string | null {
    return typeof order.orderId === "string" && order.orderId.length > 0
        ? order.orderId
        : null;
}

/**
 * Narrows the calculator's free-string trade direction to the EntryPlan
 * union. Null when unreadable — callers fail closed on null rather than
 * defaulting it to long.
 */
export function narrowTradeType(tradeType: string): "long" | "short" | null {
    const normalized = tradeType.toLowerCase();
    if (normalized === "long" || normalized === "short") return normalized;
    return null;
}

/** This entry's venue side, from the calculator's trade direction. */
function entrySideOf(tradeType: string): "BUY" | "SELL" {
    /*
     * Unknown spellings are not longs. The EntryPlan union already excludes
     * them, so this throws only on values that violated the type — a loud
     * contract breach instead of a silent direction. (Callers narrow first;
     * see the tradeType narrowing at the PlaceOrderPanel call site.)
     */
    const narrowed = narrowTradeType(tradeType);
    if (narrowed === null) {
        throw new Error(`unknown trade direction: "${tradeType}"`);
    }
    return narrowed === "short" ? "SELL" : "BUY";
}

function triggerPriceMatches(order: TpSlOrder, expected: Decimal): boolean {
    try {
        /*
         * Exact decimal equality, deliberately — the same discipline the
         * gate's own price rule uses (`decimalsAgree` in checkPrices). This
         * path carries no venue tick size to tolerance against, and an
         * invented epsilon would be a new magic number. No venue on this
         * path is observed to quantize the trigger price — the stop is
         * sent and read back verbatim — so exactness costs nothing today.
         * If a venue ever rounds to tick, the failure direction stays
         * safe: a correctly attached stop reports "unprotected", loudly
         * (burning the retry budget), instead of a false "attached".
         */
        return new Decimal(order.triggerPrice).equals(expected);
    } catch {
        // An unparsable trigger price proves nothing about this request.
        return false;
    }
}

function matchesIntent(
    order: TpSlOrder | undefined,
    expected: Decimal,
    entrySide: "BUY" | "SELL",
    beforeIds: ReadonlySet<string>,
): order is TpSlOrder {
    if (order === undefined) return false;
    const id = planIdOf(order);
    if (id !== null && beforeIds.has(id)) return false;
    // A plan without an id cannot be excluded by identity and falls back to
    // price plus side. The production type requires `orderId`, so an
    // id-less stale plan at the same price and side is the accepted
    // residual risk — and still strictly more proof than existence was.
    if (!triggerPriceMatches(order, expected)) return false;
    if (!sideCompatible(order.side, entrySide)) return false;
    return true;
}

/** The position a plan protects, or null when the venue did not say. */
function planPositionOf(order: TpSlOrder): string | null {
    return typeof order.positionId === "string" && order.positionId.length > 0
        ? order.positionId
        : null;
}

class OrderPlacementService {
    /**
     * Places the entry together with whatever protection the exchange
     * supports, then verifies the protection actually exists.
     */
    public async placeEntryGroup(plan: EntryPlan): Promise<PlacementResult> {
        const caps = capabilitiesOf(plan.exchange);
        const side: "BUY" | "SELL" = entrySideOf(plan.tradeType);
        const wantsStop = plan.stopLossPrice.gt(0);
        const wantsTarget = plan.takeProfits.length > 0;

        const attach = caps.tpSlAtEntry;

        /*
         * BUG-0502 — before-image of the symbol's plans, taken before the
         * entry is sent. Read from the cache as-is, without invalidating:
         * the point is "what was already there", and an extra fetch here
         * would only slow the placement path. Read over the whole list
         * (BUG-0524), not first-pick per leg: in hedge mode both sides
         * hold plans and every pre-existing id must land in the image.
         * Residual risk: with a cold cache and a same-price/same-side old
         * plan on-venue, identity cannot exclude it and price plus side
         * will confirm it — still strictly more proof than the old
         * existence check, and the hot path (cache warm from the position
         * cards) is fully covered. If placement latency ever allows it,
         * ensureFresh here closes the remainder.
         */
        const beforeIds = new Set<string>();
        if (wantsStop || wantsTarget) {
            for (const existing of tpSlState.ordersFor(plan.symbol)) {
                const id = planIdOf(existing);
                if (id !== null) beforeIds.add(id);
            }
        }

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
                origin: plan.origin,
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

        const confirmed = await this.confirmProtection(
            plan,
            {
                wantsStop,
                wantsTarget,
                attached: attach,
            },
            beforeIds,
        );

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
        beforeIds: ReadonlySet<string>,
    ): Promise<Omit<PlacementResult, "entryPlaced" | "clientId">> {
        const settled = want.attached ? "attached" : "placed";
        const entrySide: "BUY" | "SELL" = entrySideOf(plan.tradeType);
        /*
         * BUG-0503 — whether a missing stop is worth another attempt depends
         * on whether a standalone placement exists to attempt it with. On a
         * venue with no standalone path `replaceStop` is a no-op and the
         * sleeps around it only keep an unprotected position open longer, so
         * the loop below returns the honest outcome on its first pass.
         */
        const replacePossible = capabilitiesOf(plan.exchange).tpSlStandalone;

        /*
         * BUG-0524 — the entry's position, resolved lazily and at most once
         * per confirmation: it is only needed when a candidate actually
         * carries a position id to discriminate on. Nothing to discriminate
         * means no lookup, no polling, no added latency on the hot path —
         * one-way traders and id-less venues read exactly as before.
         */
        let entryPositionId: string | null | undefined;
        const resolveEntryPosition = async (): Promise<string | null> => {
            if (entryPositionId === undefined) {
                entryPositionId = await this.resolvePositionId(plan);
            }
            return entryPositionId;
        };

        for (let attempt = 0; attempt <= STOP_RETRY_ATTEMPTS; attempt++) {
            const orders = await this.readOrders(plan.symbol);
            // BUG-0502 — existence is not evidence. Each half only settles
            // on the plan this request produced: new, correctly priced, on
            // this entry's side — and, where both ids are known, on this
            // entry's position (BUG-0524). Read over the whole list, not
            // first-pick per leg: in hedge mode both sides hold plans and
            // the first one is an arbitrary one.
            const stop = want.wantsStop
                ? await this.anyOnPosition(
                      orders.filter(
                          (o) =>
                              o.planType === "LOSS" &&
                              matchesIntent(o, plan.stopLossPrice, entrySide, beforeIds),
                      ),
                      resolveEntryPosition,
                  )
                : false;
            const target = want.wantsTarget
                ? await this.anyOnPosition(
                      orders.filter(
                          (o) =>
                              o.planType === "PROFIT" &&
                              matchesIntent(o, plan.takeProfits[0], entrySide, beforeIds),
                      ),
                      resolveEntryPosition,
                  )
                : false;

            const stopSettled = !want.wantsStop || stop;
            const targetSettled = !want.wantsTarget || target;

            if (stopSettled && targetSettled) {
                return {
                    stopLoss: want.wantsStop ? (settled as ProtectionState) : "none",
                    takeProfit: want.wantsTarget ? (settled as ProtectionState) : "none",
                    unprotected: false,
                };
            }

            // A missing stop is worth another attempt — but only where an
            // attempt exists. A missing target is not urgent enough to spend
            // requests on mid-placement.
            if (!stopSettled && attempt < STOP_RETRY_ATTEMPTS && replacePossible) {
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
                    ? stop
                        ? (settled as ProtectionState)
                        : "failed"
                    : "none",
                takeProfit: want.wantsTarget
                    ? target
                        ? (settled as ProtectionState)
                        : "failed"
                    : "none",
                // The position exists and its stop does not. Everything about
                // this result is arranged so a caller cannot render it as a
                // success.
                unprotected: want.wantsStop && !stop,
                errorKey:
                    want.wantsStop && !stop
                        ? "orderEntry.errors.unprotected"
                        : "orderEntry.errors.targetMissing",
            };
        }

        // Unreachable: the loop returns on every path.
        return { stopLoss: "failed", takeProfit: "failed", unprotected: true };
    }

    /**
     * Whether any candidate survives position scoping (BUG-0524).
     *
     * Candidates already passed identity, price and side. A candidate
     * carrying another position's id protects the opposite hedge side (or
     * an older position) and is out. Unknown on either side confirms via
     * the fail-open fallback: a missing id must never turn a confirmation
     * "unprotected" — that would be a louder failure than the one this
     * closes. When no candidate carries an id at all there is nothing to
     * discriminate and the entry's position is never even looked up.
     */
    private async anyOnPosition(
        candidates: TpSlOrder[],
        resolveEntryPosition: () => Promise<string | null>,
    ): Promise<boolean> {
        if (candidates.length === 0) return false;
        if (!candidates.some((o) => planPositionOf(o) !== null)) return true;
        const entryPositionId = await resolveEntryPosition();
        return candidates.some((o) => {
            const planPositionId = planPositionOf(o);
            return (
                planPositionId === null || entryPositionId === null || planPositionId === entryPositionId
            );
        });
    }

    /**
     * Re-reads the exchange's plans for a symbol, bypassing the cache
     * window. The whole list, not first-pick per leg (BUG-0524): the
     * confirmation matches by position over all of them.
     */
    private async readOrders(symbol: string): Promise<TpSlOrder[]> {
        tpSlState.invalidate();
        await tpSlState.ensureFresh();
        return tpSlState.ordersFor(symbol);
    }

    /**
     * Places a stop on its own, for the retry path and for exchanges that
     * cannot attach one at entry.
     *
     * Goes through the position-wide TP/SL placement (`tpsl/place_order`,
     * FEAT-0070). Whether that path exists is `tpSlStandalone` — the
     * standalone half of the capability split — not `tpSlAtEntry`: a venue
     * that attaches nothing but takes a standalone plan must still be
     * retried here, and a venue with neither skips straight to the honest
     * UNPROTECTED outcome instead of guessing at an unverified request
     * format.
     */
    private async replaceStop(plan: EntryPlan): Promise<void> {
        if (!capabilitiesOf(plan.exchange).tpSlStandalone) {
            return;
        }

        const positionId = await this.resolvePositionId(plan);
        if (positionId === null) {
            logger.warn(
                "market",
                `[Placement] No position id for ${plan.symbol}, cannot re-place stop`,
            );
            return;
        }

        try {
            await tradeService.placePositionTpSl({
                symbol: plan.symbol,
                positionId,
                stopLoss: { price: plan.stopLossPrice },
                context: { side: plan.tradeType, entryPrice: plan.entryPrice },
            });
        } catch (error) {
            // The retry window ends in the loud UNPROTECTED result either way;
            // this only explains why the re-place did not go through.
            logger.warn(
                "market",
                `[Placement] Re-placing stop for ${plan.symbol} failed: ${getDisplayMessage(error)}`,
            );
        }
    }

    /**
     * Finds the fresh position's exchange id for a symbol/side. The positions
     * list is WS/REST-hydrated; if the entry has not shown up yet, nudge a
     * sync and poll briefly — requestSync is fire-and-forget, so there is
     * nothing to await directly.
     */
    private async resolvePositionId(plan: EntryPlan): Promise<string | null> {
        for (let attempt = 0; attempt < POSITION_ID_POLLS; attempt++) {
            const position = accountState.positions.find(
                (p) => p.symbol === plan.symbol && p.side === plan.tradeType,
            );
            if (position) {
                return position.positionId;
            }
            if (attempt < POSITION_ID_POLLS - 1) {
                accountState.requestSync();
                await new Promise((resolve) => setTimeout(resolve, POSITION_ID_POLL_MS));
            }
        }
        return null;
    }
}

export const orderPlacementService = new OrderPlacementService();
