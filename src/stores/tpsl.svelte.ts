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
 * Pending TP/SL plans — FEAT-0057.
 *
 * Showing a position's stop and target on its own card was the last open
 * acceptance criterion of that item, and it was left open for a concrete
 * reason: `TpSlList` fetches plans from a dedicated endpoint
 * (`tradeService.fetchTpSlOrders()`), not from `accountState.openOrders`, so
 * "just render what we already have" was never available. The choice was
 * between an eager fetch the card does not otherwise need, and reusing the
 * list's on-demand fetch some other way.
 *
 * This is that other way: one cache both consumers read. The fetch happens
 * when plans are about to be *displayed* — which is when the card renders or
 * the TP/SL tab opens, whichever comes first — and the result serves both.
 * Opening the tab after looking at the positions list now costs nothing,
 * where before it always refetched.
 *
 * The honest cost: a trader who keeps the Positions tab open and never looks
 * at the TP/SL tab now makes requests they previously did not. `MAX_AGE_MS`
 * and the in-flight dedupe below are what keep that bounded, and the fetch is
 * skipped entirely when there are no positions to annotate.
 *
 * Only *pending* plans live here. The history view is TpSlList's own concern:
 * a closed plan can never belong to an open position, so the card has no use
 * for it and caching it would buy nothing.
 */

import { Decimal } from "decimal.js";
import { activeExchange, type TpSlOrder } from "../services/exchange";
import { logger } from "../services/logger";
import { planSideMatchesEntry, readLegFields } from "../services/tpslNormalize";

/**
 * How long a fetched set is treated as current. Plans change when the user
 * edits them — which goes through this store and invalidates it — or when
 * one triggers, which is an event the position list reflects anyway.
 */
export const MAX_AGE_MS = 30_000;

export interface SymbolPlans {
    /** Take-profit plan, if one is set. */
    profit?: TpSlOrder;
    /** Stop-loss plan, if one is set. */
    loss?: TpSlOrder;
}

/**
 * Bitunix's dedicated TP/SL channel (docs/bitunix-api/08_websocket.md:294) —
 * a single push carries whichever of the two legs it concerns, not
 * necessarily both ("Mind. eines von tpQty/slQty erforderlich").
 */
export interface RawWsTpSl {
    event?: string;
    orderId?: string | number;
    symbol?: string;
    status?: string;
    tpPrice?: string;
    slPrice?: string;
    /*
     * BUG-0698 — the per-leg fields the same frame carries. The frame is
     * sparse: it names what moved, and a leg it does not concern is omitted
     * rather than nulled. `readLegFields` applies the fetch path's presence
     * rule, so `"0"` is a value and `""`/`null` are absent.
     *
     * Types stay loose because the channel is forwarded verbatim; `String()`
     * in `readLegFields` is the single place that narrows them.
     */
    tpStopType?: string | number | null;
    slStopType?: string | number | null;
    tpOrderType?: string | number | null;
    slOrderType?: string | number | null;
    tpQty?: string | number | null;
    slQty?: string | number | null;
    tpOrderPrice?: string | number | null;
    slOrderPrice?: string | number | null;
    /**
     * BUG-0524 — the position this plan protects, as the venue reports it
     * (`08_websocket.md` §`tp_sl`). Carried onto the legs below so the
     * placement confirmation can tell hedge sides apart. Deliberately no
     * `side`: whether the venue means the stop order's side or the
     * position's side is unconfirmed, and mapping it risks inverting the
     * check it would serve.
     */
    positionId?: string | number;
}

function planTypeOf(order: TpSlOrder): "PROFIT" | "LOSS" | null {
    const raw = String(order.planType ?? "").toUpperCase();
    if (raw.includes("PROFIT")) return "PROFIT";
    if (raw.includes("LOSS")) return "LOSS";
    return null;
}

class TpSlManager {
    private _orders = $state<TpSlOrder[]>([]);
    private _loading = $state(false);
    private _error = $state<string | null>(null);
    private _loadedAt: number | null = null;
    /** De-dupes concurrent callers so two consumers cannot double-fetch. */
    private inFlight: Promise<void> | null = null;
    /**
     * Bumped by `invalidate()`. A request captures it on the way out and may
     * only write back if it still matches — see BUG-0661.
     */
    private generation = 0;

    get orders(): readonly TpSlOrder[] {
        return this._orders;
    }

    get loading(): boolean {
        return this._loading;
    }

    get error(): string | null {
        return this._error;
    }

    get loadedAt(): number | null {
        return this._loadedAt;
    }

    /**
     * The plans attached to one symbol. Returns an empty object rather than
     * null so a caller can destructure it without a guard — "no plans" and
     * "not loaded yet" look the same to a card, and both mean "show nothing".
     */
    public plansFor(symbol: string): SymbolPlans {
        const plans: SymbolPlans = {};
        for (const order of this._orders) {
            if (order.symbol !== symbol) continue;
            const type = planTypeOf(order);
            if (type === "PROFIT" && !plans.profit) plans.profit = order;
            if (type === "LOSS" && !plans.loss) plans.loss = order;
        }
        return plans;
    }

    public hasPlansFor(symbol: string): boolean {
        return this._orders.some((o) => o.symbol === symbol);
    }

    /**
     * Every plan the store holds for a symbol, both legs, unfiltered.
     *
     * BUG-0524 — `plansFor` answers the cards ("show me what is on this
     * symbol") and returns only the first plan per leg type, which in hedge
     * mode with stops on both sides is an arbitrary one. Confirming a
     * placement must see all of them and pick by position, so it reads here
     * instead. A copy: callers must not reorder the store's own list.
     */
    public ordersFor(symbol: string): TpSlOrder[] {
        return this._orders.filter((o) => o.symbol === symbol);
    }

    /**
     * The resting stop trigger for a position, or null when none is safely
     * attributable — BUG-0510.
     *
     * Scoped by position over the whole list, not first-pick by side
     * (BUG-0524): in hedge mode both sides hold stops and the first LOSS
     * leg is an arbitrary one. A leg carrying another position's id is out;
     * a leg carrying no id when the position is known cannot be attributed
     * and is out too — for risk measurement unknown means unmeasurable,
     * not unprotected. The side rule stays as the second gate
     * (`planSideMatchesEntry`, shared with the placement confirmation):
     * production plans carry no side and pass it, a contradicting side
     * excludes. Null, never zero: zero would read as "no risk".
     */
    public restingStopPrice(
        symbol: string,
        side: "long" | "short",
        positionId?: string | null,
    ): Decimal | null {
        const entrySide = side === "short" ? "SELL" : "BUY";
        const losses = this.ordersFor(symbol).filter((o) => planTypeOf(o) === "LOSS");
        const scoped = positionId
            ? losses.filter((o) => o.positionId === positionId)
            : losses;
        for (const loss of scoped) {
            if (!planSideMatchesEntry(loss.side, entrySide)) continue;
            try {
                const price = new Decimal(loss.triggerPrice);
                if (!price.isFinite() || price.lte(0)) continue;
                return price;
            } catch {
                // Not a normal absence: the store holds this leg and its stored
                // trigger cannot be read, which would otherwise surface as "no
                // stop" with nothing saying why. Still skipped — inventing a
                // number is the one outcome worse than reporting none.
                logger.debug("api", "[TpSl] unreadable trigger skipped", {
                    orderId: loss.orderId,
                    triggerPrice: loss.triggerPrice,
                });
                continue;
            }
        }
        return null;
    }

    /**
     * Fetches if the cache is stale, and does nothing if it is not. Safe to
     * call from a render path: concurrent calls share one request, and a
     * failure is recorded rather than thrown — a position card must still
     * render when the TP/SL endpoint is unavailable.
     *
     * `force` is for the caller that just changed something — a TP/SL drag,
     * a cancel. Collapsing that read onto an in-flight request is right for
     * two readers and wrong here: the outstanding request was issued *before*
     * the mutation, so its response describes the old state (BUG-0661). A
     * forced read therefore starts its own request and runs concurrently; the
     * generation guard below decides which of the two may write.
     */
    public async ensureFresh(now = Date.now(), force = false): Promise<void> {
        if (!force) {
            if (this.inFlight) return this.inFlight;
            if (this._loadedAt !== null && now - this._loadedAt < MAX_AGE_MS) return;
        }

        const generation = this.generation;
        /*
         * Started through `Promise.resolve().then` so the body cannot run
         * before `this.inFlight` has been assigned. A synchronous throw inside
         * it — `bitunixAdapter.fetchTpSlOrders` is a non-async arrow, so one is
         * not structurally impossible — would otherwise run `finally` while
         * `request` is still in its temporal dead zone, replacing the real
         * error with a ReferenceError and leaving `inFlight` permanently
         * rejected.
         */
        const request = Promise.resolve().then(async () => {
            this._loading = true;
            try {
                const orders = await activeExchange().trading.fetchTpSlOrders("pending");
                // Superseded: `invalidate()` ran while this was in flight, so
                // these rows predate the mutation it announced. Writing them
                // would show the stale level *and* stamp it fresh for the whole
                // window — the display would then contradict the venue with
                // nothing saying so. That is BUG-0661.
                if (generation !== this.generation) {
                    // Not silent: "the venue updated, the display did not" is
                    // exactly the symptom this guard exists to prevent, and a
                    // drop with no trace is the one failure mode that cannot be
                    // diagnosed after the fact. `debug` level, and bounded by
                    // real mutations — the chart effect alone never mismatches.
                    logger.debug("api", "[TpSl] superseded response dropped", {
                        generation,
                        current: this.generation,
                    });
                    return;
                }
                this._orders = orders;
                // Stamped with the caller's clock, not `Date.now()`, so the
                // staleness check above and this always measure the same
                // thing. Dating the window from the request rather than the
                // response also errs short, which is the right direction for
                // a cache of live stop levels.
                this._loadedAt = now;
                this._error = null;
            } catch (e) {
                // Same reasoning as the data write: a failure of a superseded
                // request says nothing about the state a newer read reports,
                // and that read reports its own.
                if (generation !== this.generation) {
                    logger.debug("api", "[TpSl] superseded failure dropped", {
                        generation,
                        current: this.generation,
                    });
                    return;
                }
                this._error = e instanceof Error ? e.message : String(e);
                logger.debug("api", "[TpSl] Fetch failed", e);
            } finally {
                // Only the request that still owns the slot may clear it — a
                // forced read can be overtaken while this one settles.
                if (this.inFlight === request) {
                    this._loading = false;
                    this.inFlight = null;
                }
            }
        });

        this.inFlight = request;
        return request;
    }

    /**
     * Applies a live push from Bitunix's TP/SL channel — the leg it carries
     * lands (or is removed) immediately, instead of waiting for the next
     * `ensureFresh()` to happen to fall outside the 30s cache window. This is
     * what makes a freshly-attached bracket stop show up on its own, without
     * needing something else (like opening the TP/SL tab) to force a refetch.
     */
    public updateFromWs(data: RawWsTpSl): void {
        const orderId =
            data.orderId !== undefined && data.orderId !== null ? String(data.orderId) : "";
        if (!orderId || !data.symbol) {
            // A drop with no trace is the failure mode that cannot be
            // diagnosed after the fact, and a renamed field on this channel
            // would make every push vanish exactly here.
            logger.debug("api", "[TpSl] push dropped, no orderId or symbol", { data });
            return;
        }
        const symbol = data.symbol;
        /*
         * Terminal on this channel is any status other than `NEW`; a status
         * that says nothing — absent, or empty — leaves the leg as it was.
         *
         * `docs/bitunix-api/08_websocket.md:366` documents the enum as `NEW`
         * / `CANCELED` / `SYSTEM_CANCELED` / `FILLED` / `FAILED`. The
         * hand-written pair that stood here (`CANCELED`, `FILLED`) predates
         * that page's correction, so it missed `SYSTEM_CANCELED` — the value
         * that tells a venue-initiated cancel from a user-initiated one — and
         * `FAILED` entirely (BUG-0697). A leg the venue had cancelled stayed
         * resting, and `restingStopPrice()` went on reporting a stop the venue
         * no longer held.
         *
         * Inverted rather than extended, so an unlisted status is terminal.
         * That is a bet on the venue's push discipline, not a proof: the same
         * page names `PENDING_CANCEL` and `TRIGGER_WAIT_PLACE` as statuses that
         * exist and are not pushed (`:386`), and either would be non-terminal
         * if it ever arrived. Still the direction to err in — of the two ways
         * to be wrong, only resting leaves a phantom stop to size against.
         *
         * The `event === "CLOSE"` arm is untouched and obeys neither rule
         * above: `:404` says "Read `event` together with `status`, always. A
         * `CLOSE` on its own is not a final state", yet this arm removes a leg
         * on `{event: "CLOSE", status: "NEW"}`. Kept deliberately (BUG-0699):
         * the vendor sentence is about reading the event *alone*, and this
         * channel pushes a status that is terminal in practice, so the arm is
         * the belt to the status arm's braces. Erring terminal is also the
         * cheap direction here — a leg wrongly kept is a phantom stop for the
         * risk engine to measure, while one wrongly removed only refuses an
         * `add` until the cache window expires. `tpsl.test.ts` pins both frame
         * shapes, so changing this is a test change, not a refactor.
         */
        const status = data.status;
        const closed =
            data.event === "CLOSE" ||
            (status !== undefined && status !== "" && status !== "NEW");
        const positionId =
            data.positionId !== undefined && data.positionId !== null && data.positionId !== ""
                ? String(data.positionId)
                : undefined;

        const frame = data as unknown as Record<string, unknown>;
        const applyLeg = (leg: "tp" | "sl", planType: "PROFIT" | "LOSS") => {
            const legId = `${orderId}-${leg}`;
            const index = this._orders.findIndex((o) => o.orderId === legId);
            /*
             * The terminal check runs before the price guard on purpose. A
             * close frame need not echo the leg's price, and with the guard
             * first a price-less close was a silent no-op: the leg stayed
             * resting in the store carrying its `sourceOrderId` and
             * `positionId`, and the next push for that row merged into it.
             */
            if (closed) {
                if (index !== -1) {
                    // Not silent, for the reason the superseded guard above is
                    // not: a leg that disappears is the display contradicting
                    // the venue. `debug` follows that guard and the item's own
                    // wording. Note what the level does not promise: `logger.ts`
                    // gates `debug` on DEV and on `debugMode`, so this traces
                    // in development and is not a production record. Bounded by
                    // real venue events rather than by polling.
                    logger.debug("api", "[TpSl] leg removed on terminal push", {
                        orderId: legId,
                        status: data.status,
                        event: data.event,
                    });
                    this._orders.splice(index, 1);
                }
                return;
            }
            /*
             * A leg needs a trigger price to exist; an *update* does not.
             *
             * The frame is sparse and may name only what moved (`tpStopType`
             * without `tpPrice`), so requiring a price before merging would
             * drop exactly the update BUG-0698 is about. A push that names no
             * price and matches no stored leg is still dropped: creating a leg
             * without a trigger would put a stop on screen the venue does not
             * hold.
             *
             * A renamed price field would make *both* legs price-less on every
             * frame, which is indistinguishable from this frame being about the
             * other leg. The fetch path is what surfaces that, within the cache
             * window. The `orderId`/`symbol` guard above is the one that can
             * tell a malformed frame from a narrow one, which is why it is the
             * one that speaks.
             */
            const fields = readLegFields(frame, leg);
            const stored = index !== -1 ? this._orders[index] : undefined;
            const triggerPrice = fields.price ?? stored?.triggerPrice;
            if (triggerPrice === undefined) return;
            /*
             * Merge into the stored leg rather than rebuilding it (BUG-0665).
             *
             * The frame names the venue row and carries what changed about
             * it. What it cannot carry is what this app *derived* from the
             * row: the `scopeGuess` create-versus-edit turns on and the
             * timestamps the list renders. Rebuilding from the frame alone
             * dropped those on the first push.
             *
             * BUG-0698: the per-leg fields the frame *does* carry — stop type,
             * order type, quantity, order price — replace the fetched value.
             * A frame that omits one says nothing about it, so the fetched
             * value stays and only a fetch can clear it. `scopeGuess` is
             * derived from the quantity, so a push that names one recomputes
             * it rather than carrying the old guess.
             *
             * `sourceOrderId` is the exception, and the reason BUG-0665 was
             * filed: the frame names the row itself, so the id cancel and edit
             * address the venue with (BUG-0292) is known here — it does not
             * have to be inherited, and a leg the push *creates* gets it too.
             */
            const updated: TpSlOrder = {
                ...stored,
                sourceOrderId: orderId,
                orderId: legId,
                symbol,
                planType,
                triggerPrice,
                status: data.status ?? "NEW",
                ...(positionId !== undefined ? { positionId } : {}),
                ...(fields.stopType !== undefined ? { workingType: fields.stopType } : {}),
                ...(fields.orderType !== undefined ? { orderType: fields.orderType } : {}),
                ...(fields.orderPrice !== undefined ? { price: fields.orderPrice } : {}),
                ...(fields.qty !== undefined
                    ? { qty: fields.qty, scopeGuess: "partial" as const }
                    : {}),
            };
            if (index !== -1) this._orders[index] = updated;
            else this._orders.push(updated);
        };

        /*
         * A terminal frame mutates the store, so it has to invalidate the way
         * `invalidate()` does. A fetch issued before this frame read the row
         * while it still rested; writing its rows back afterwards re-stamps the
         * cancelled leg as current for a whole window — BUG-0697's consequence,
         * reached through the fetch path instead of the status test. Bumped
         * once per frame rather than per leg. `_loadedAt` is deliberately left
         * alone: what the store holds now came from the venue itself, newer
         * than any response still in flight.
         */
        if (closed) this.generation++;

        applyLeg("tp", "PROFIT");
        applyLeg("sl", "LOSS");
    }

    /**
     * Marks the cache stale. Call after anything that changes plans — an
     * edit, a cancel, a position closing — so the next read refetches
     * instead of showing a plan that no longer exists.
     *
     * Also bumps the request generation (BUG-0661). Nulling `_loadedAt` alone
     * only convinces the *next* caller to refetch; it does nothing about the
     * request already in flight, which was issued against the pre-mutation
     * state and would write its rows back over the fresh ones. Cancelling it
     * is not an option either — there is no abort signal on this path, and a
     * response can arrive at any time. Refusing to let a superseded request
     * write is both cheaper and simpler.
     */
    public invalidate(): void {
        this._loadedAt = null;
        this.generation++;
    }

    /**
     * Drops everything. Used when the account or exchange changes.
     *
     * Bumps the generation for the same reason `invalidate()` does: a request
     * still in flight was issued against the account being dropped, and its
     * response — rows *and* error message — would otherwise land in the fresh
     * store stamped current. `reset()` is the account boundary, so this is the
     * one path where writing the previous account's data is worst.
     */
    public reset(): void {
        this._orders = [];
        this._loadedAt = null;
        this._error = null;
        this.generation++;
    }
}

export const tpSlState = new TpSlManager();
