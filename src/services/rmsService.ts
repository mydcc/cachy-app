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
 * Copyright (C) 2026 MYDCT
 *
 * Risk Management Service (RMS)
 * Monitors trading rules, validates exposure, and enforces safety limits.
 *
 * FEAT-0013 lives here: the limits and the kill switch are evaluated in this
 * file and reported to the FEAT-0011 gate through the hooks it exposes. They
 * are enforced where orders leave, not where they are entered, so nothing can
 * route around them by constructing an order some other way.
 */

import { omsService } from "./omsService";
import { tradeState } from "../stores/trade.svelte";
import { accountState } from "../stores/account.svelte";
import { journalState } from "../stores/journal.svelte";
import { riskState } from "../stores/riskLimits.svelte";
import { settingsState } from "../stores/settings.svelte";
import { logger } from "./logger";
import { Decimal } from "decimal.js";
import { getTradePnL } from "../lib/calculators/core";
import { entryRoleForOrderType } from "../lib/fees/feeProvenance";
import {
    registerConfirmationCheck,
    registerKillSwitch,
    registerRiskLimitCheck,
    type OrderIntent,
    type OrderRefusal,
} from "./orderGate";
import { confirmationPolicyStore } from "../stores/confirmationPolicy.svelte";
import type { JournalEntry } from "../stores/types";
import {
    CLOSED_JOURNAL_STATUSES,
    KNOWN_JOURNAL_STATUSES,
} from "../lib/journalStatus";

export interface RiskProfile {
    maxPositionSizeUsdt: Decimal;
    maxDrawdownPercent: number;
    stopLossRequired: boolean;
}

/**
 * Statuses that mean the trade is over and its result is real money. Open and
 * planned entries carry no realised PnL, so they cannot move a daily counter.
 *
 * Shared with the journal store (`CLOSED_JOURNAL_STATUSES`): `Closed` is the
 * legacy terminal status and carries real money. `getTradePnL` has no
 * `Closed` branch of its own — a nonzero recorded amount still returns
 * through its `totalNetProfit` first branch, while zero/missing falls to 0
 * (which is exactly why the gate's completeness check, not the sum, handles
 * amount-less closes). Dropping `Closed` from this set would hide realised
 * losses from the gate (BUG-0499). Statistics that filter on Won/Lost
 * themselves are unaffected.
 */
const CLOSED_STATUSES: ReadonlySet<string> = CLOSED_JOURNAL_STATUSES;

/**
 * Every status the app knows. An entry carrying anything else — a breakeven
 * wording, a future feature's status, an import's invention — represents
 * money the counter cannot attribute, so the day reads incomplete rather
 * than zero (BUG-0499). The `JournalStatus` union guards the type and
 * `normalizeJournalEntry` coerces on the way in; this guards whatever reaches
 * the gate anyway.
 */
const KNOWN_STATUSES: ReadonlySet<string> = new Set(KNOWN_JOURNAL_STATUSES);

/** Today's realised PnL together with whether the journal could be measured. */
export interface DailyLossAssessment {
    loss: Decimal;
    complete: boolean;
    /**
     * Why the day is unmeasurable, when it is (BUG-0523). First cause wins,
     * so the refusal names one concrete remedy instead of "something".
     * Null exactly when `complete` is true.
     */
    cause: DailyLossCause | null;
}

/**
 * The ways a journal day can resist measurement, in the order the gate
 * checks them. One key per cause in the refusal — a fail-closed gate must
 * say what to fix, not just that it refused.
 */
export type DailyLossCause = "no-amount" | "no-exit-date" | "unknown-status" | "stale-sync";

/**
 * One refusal key per unmeasurable cause (BUG-0523). The messages name the
 * remedy — enter the amount, set the close date, fix the status, run the
 * history sync — because a fail-closed gate must say what to fix.
 */
const DAILY_LOSS_CAUSE_KEYS: Record<DailyLossCause, string> = {
    "no-amount": "orderGate.dailyLossUnmeasurableNoAmount",
    "no-exit-date": "orderGate.dailyLossUnmeasurableNoExitDate",
    "unknown-status": "orderGate.dailyLossUnmeasurableUnknownStatus",
    "stale-sync": "orderGate.dailyLossUnmeasurableStaleSync",
};

/**
 * The daily-loss window runs from 00:00 UTC to 00:00 UTC.
 *
 * UTC rather than the user's local day, for three reasons. Journal entries are
 * stamped as ISO strings and exchange fills arrive in UTC, so a UTC window is
 * the one that agrees with the records it is measured against. A local window
 * in a DST-observing zone has a 23-hour and a 25-hour day each year, and the
 * 25-hour one silently widens the limit. And a fixed boundary is reproducible
 * — two people reading the same journal get the same number.
 *
 * The cost is real and worth naming: a trader at UTC+13 sees the counter reset
 * in the middle of their evening. The UI states the boundary and shows the
 * next reset in local time so it is never a surprise.
 */
export function utcDayStart(now: number): number {
    const d = new Date(now);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** When a journal entry's result became real. */
function closeTimestamp(entry: JournalEntry): number | null {
    const raw = entry.exitDate || entry.date;
    if (!raw) return null;
    const ts = new Date(raw).getTime();
    return Number.isFinite(ts) ? ts : null;
}

function toDecimal(value: unknown): Decimal | null {
    if (value === null || value === undefined || value === "") return null;
    if (value instanceof Decimal || Decimal.isDecimal(value)) return value as Decimal;
    if (typeof value !== "string" && typeof value !== "number") return null;
    try {
        const d = new Decimal(value);
        return d.isFinite() && !d.isNaN() ? d : null;
    } catch {
        return null;
    }
}

/**
 * The position side an order's venue side opens, or null when the side is
 * absent or outside the vocabulary this codebase writes (BUG-0515). Null
 * never exempts: an unknowable side cannot prove a merge.
 */
function positionSideOf(side: unknown): "long" | "short" | null {
    if (typeof side !== "string") return null;
    const s = side.toUpperCase();
    if (s === "BUY" || s === "LONG") return "long";
    if (s === "SELL" || s === "SHORT") return "short";
    return null;
}

/**
 * The fee rate (percent, e.g. `0.042` for 0.042%) for one leg, or null when
 * no rate can be resolved (BUG-0500).
 *
 * Broker-derived fills win when a broker is in play — paper mode has none,
 * so a stale live-session rate must not leak into a simulation
 * (feeProvenance). Otherwise the venue's Settings rate applies, which is the
 * documented VIP-0 default until the trader overrides it. Each leg resolves
 * independently: a maker rate without a taker rate (or vice versa) still
 * refuses as unmeasurable rather than borrowing the other leg's number.
 * Null, never zero: falling back to zero fees reintroduces the pre-fee
 * under-measurement under a different name, so the caller refuses as
 * unmeasurable instead. Venues are looked up, not enumerated, so a future
 * venue works without touching this function — an unknown venue resolves to
 * null and refuses closed.
 */
function feeRateFor(
    role: "maker" | "taker",
    venue: string,
    paperMode: boolean | undefined,
): Decimal | null {
    if (!paperMode) {
        const remote =
            role === "maker" ? tradeState.remoteMakerFee : tradeState.remoteTakerFee;
        if (remote !== undefined && remote.isFinite()) return remote;
    }
    const table = (settingsState.feeRates as Partial<
        Record<string, { maker?: unknown; taker?: unknown }>
    >)[venue];
    const parsed = toDecimal(table?.[role]);
    return parsed !== null && parsed.isFinite() ? parsed : null;
}

/**
 * The venue side an intent's entry leg fills on, from the order type the
 * intent carries (feeProvenance: only a resting limit order is a maker
 * fill). Unknown types land on taker — the expensive rate is the safe
 * direction for a limit that caps losses.
 */
function entryRoleOf(orderType: unknown): "maker" | "taker" {
    if (typeof orderType !== "string") return "taker";
    return entryRoleForOrderType(
        orderType.toLowerCase() === "limit"
            ? "limit"
            : orderType.toLowerCase() === "market"
              ? "market"
              : "trigger",
    );
}

function limitRefusal(
    field: string,
    limit: Decimal | number,
    actual: Decimal | number,
): OrderRefusal {
    return {
        field,
        reason: "riskLimit",
        messageKey: "orderGate.riskLimit",
        values: { field, limit: String(limit), actual: String(actual) },
    };
}

/** A limit is configured but the order carries nothing to measure it against. */
function unmeasurable(field: string): OrderRefusal {
    return {
        field,
        reason: "missing",
        messageKey: "orderGate.riskLimitUnmeasurable",
        values: { field },
    };
}

/** A configured risk limit cannot be read safely, so exposure stays blocked. */
function invalidRiskState(field: string): OrderRefusal {
    return {
        field,
        reason: "riskLimit",
        messageKey: "orderGate.riskLimitInvalidState",
        values: { field },
    };
}

/**
 * Whether the entry states a realised amount.
 *
 * A zero counts as missing: "entered 0" and "forgot to enter anything" are
 * indistinguishable on the record, and for a safety gate the wrong guess in
 * the permissive direction is the failure (BUG-0499). Remedy for a genuine
 * scratch trade: put it on status `Won` — a breakeven win of 0 is
 * meaningful there and stays complete — or enter the actual amount. A `Won`
 * entry with no amount is therefore the exception: refusing on it would
 * block ordinary trading.
 */
function hasRealisedAmount(entry: JournalEntry): boolean {
    const parsed = readRealisedAmount(entry);
    return parsed !== null && !parsed.isZero();
}

/**
 * Whether the entry's realised amount counts as measured (BUG-0523).
 *
 * Synced rows carry actual venue figures: a recorded zero is a measured
 * zero, not a forgotten amount. Manual rows keep the strict reading — a
 * hand-typed 0 usually means "never entered", and for a safety gate the
 * wrong guess in the permissive direction is the failure. Fully absent
 * amounts stay unmeasured on both paths.
 */
function isMeasuredAmount(entry: JournalEntry): boolean {
    if (entry.isManual === false) return readRealisedAmount(entry) !== null;
    return hasRealisedAmount(entry);
}

/** The realised amount as a finite Decimal, or null when there is none. */
function readRealisedAmount(entry: JournalEntry): Decimal | null {
    // Runtime data arrives as strings from storage, CSV and sync paths, so
    // read through `unknown` even though the type says `Decimal`.
    const raw: unknown = entry.totalNetProfit;
    if (raw === null || raw === undefined || raw === "") return null;
    try {
        const d =
            raw instanceof Decimal || Decimal.isDecimal(raw)
                ? (raw as Decimal)
                : new Decimal(raw as string | number);
        return d.isFinite() && !d.isNaN() ? d : null;
    } catch {
        return null;
    }
}

class RiskManagementService {
    private profile: RiskProfile = {
        maxPositionSizeUsdt: new Decimal(5000), // Default safety limit
        maxDrawdownPercent: 5,
        stopLossRequired: true
    };

    /**
     * Validates if a proposed trade complies with risk rules.
     */
    public validateTrade(symbol: string, side: string, amountUsdt: Decimal): { allowed: boolean; reason?: string } {
        // 1. Max Size Check
        if (amountUsdt.gt(this.profile.maxPositionSizeUsdt)) {
            return { allowed: false, reason: "EXCEEDS_MAX_POSITION_SIZE" };
        }

        // 2. Margin Check (Prevent Suicide Trades)
        // Heuristic: If we have an open position in opposite direction, this is likely a close -> Skip Check.
        // If no position or same direction, this is an Open/Add -> Check Margin.
        const positions = omsService.getPositions();
        const existingPos = positions.find(p => p.symbol === symbol);

        const isLikelyClose = existingPos && existingPos.side !== side;

        if (!isLikelyClose) {
            const leverage = new Decimal(tradeState.leverage || 10);
            // Required Margin = Notional / Leverage
            const requiredMargin = amountUsdt.div(leverage);

            const usdtAsset = accountState.assets.find(a => a.currency === "USDT");
            const available = usdtAsset ? usdtAsset.available : new Decimal(0);

            // If we don't have asset data loaded yet (available is 0), we might skip or block.
            // Blocking is safer for "Institutional Grade".
            if (requiredMargin.gt(available)) {
                return { allowed: false, reason: `INSUFFICIENT_MARGIN (Req: ${requiredMargin.toFixed(2)}, Avail: ${available.toFixed(2)})` };
            }
        }

        return { allowed: true };
    }

    // -- FEAT-0013 -----------------------------------------------------------

    /**
     * Hands the limits, the kill switch and the confirmation policy to the
     * gate. Called once at startup. Until this runs, all three hooks are
     * unregistered and the gate approves on those checks — so this is not
     * optional wiring.
     *
     * The confirmation policy (FEAT-0024) rides along here rather than
     * installing itself, because "everything the gate consults but does not
     * define" is one concern with one lifecycle — a second install point is a
     * second thing to forget in a test setup.
     */
    public installGateHooks(): void {
        registerKillSwitch((intent) => this.isBlockedByKillSwitch(intent));
        registerRiskLimitCheck((intent) => this.checkLimits(intent));
        registerConfirmationCheck((action) =>
            confirmationPolicyStore.requiresForWireAction(action),
        );
    }

    /** Test seam — removes the hooks this service installed. */
    public uninstallGateHooks(): void {
        registerKillSwitch(null);
        registerRiskLimitCheck(null);
        registerConfirmationCheck(null);
    }

    /**
     * Whether an order creates or increases exposure, and is therefore
     * something the kill switch stops.
     *
     * The carve-outs are the point of the feature, not an oversight:
     *
     * - **Closes and cancels pass.** A switch that also blocked them would
     *   trap a user in their positions during exactly the event that made
     *   them hit it.
     * - **TP/SL modifications pass.** A stop or target plan attaches to a
     *   position that already exists and can only ever reduce it. Blocking a
     *   stop-loss adjustment mid-panic is worse than allowing one that
     *   happens to widen it, and deciding "widening vs tightening" needs the
     *   position side and mark price — getting that wrong refuses a
     *   legitimate stop move at the worst possible moment.
     * - **Pending-order amendments (`modify-order`) are blocked.** Those can
     *   raise quantity or price on a resting order, and cancelling is always
     *   available instead.
     */
    public increasesExposure(intent: OrderIntent): boolean {
        if (intent.kind === "open") return true;
        // An add is an opening order by another name (FEAT-0334) — it buys
        // more of the same exposure. A kill switch that let scaling-in through
        // would be a kill switch in name only, and this is the one place that
        // has to know it, because `add` is otherwise verified like a reduce.
        if (intent.kind === "add") return true;
        if (intent.kind === "modify") return intent.endpoint !== "/api/tpsl";
        return false;
    }

    public isBlockedByKillSwitch(intent: OrderIntent): boolean {
        if (!riskState.isKillSwitchEngaged) return false;
        return this.increasesExposure(intent);
    }

    /**
     * Realised PnL for the current UTC day, as `Decimal`.
     *
     * Paper trades never count. FEAT-0012 marks its entries with `isPaper`,
     * and the filter here is written against that flag explicitly rather than
     * relying on paper trades happening not to reach the journal — an
     * incidental exclusion is one refactor away from being no exclusion.
     *
     * This is the statistics reading: entries the journal cannot place in
     * time or amount contribute nothing. The gate must not use this number
     * alone — see `assessDailyLoss`.
     */
    public realizedPnlToday(now = Date.now()): Decimal {
        return this.assessDailyLoss(now).loss;
    }

    /**
     * The gate's reading of today's realised PnL: the sum plus whether the
     * journal could actually be measured (BUG-0499).
     *
     * The journal is a record a trader keeps; the limit is a gate that stops
     * orders. Those have opposite failure preferences — the record must not
     * invent a loss it was not told about (`getTradePnL` stays as it is),
     * while the gate must not assume a loss did not happen. So every entry
     * that is *known* incomplete marks the figure incomplete instead of
     * contributing zero:
     *
     * - a `Lost`/`Closed` entry with no amount (forgotten, not zero),
     * - a closed entry with no `exitDate` (dating it by its open day would
     *   hide an overnight loss from today's limit),
     * - a status outside the known set (a wording the counter cannot
     *   attribute — the `JournalStatus` union guards the type, this guards
     *   runtime data),
     * - synced trades in the journal without a same-day position-history
     *   sync (anything the venue closed since is invisible).
     *
     * Day-scoped: an entry whose close day is provably outside today is
     * skipped before any of those checks, so a 2024 import row can never
     * refuse a 2026 open. Only entries that could belong to today — or whose
     * day is unknowable — can mark the figure incomplete.
     *
     * A `Won` entry with no amount is the one exception: a breakeven win of
     * 0 is meaningful, and refusing on it would block ordinary trading.
     * Manual-only journals never trip the sync rule — there is no venue
     * source to be stale behind.
     */
    public assessDailyLoss(now = Date.now()): DailyLossAssessment {
        const dayStart = utcDayStart(now);
        let total = new Decimal(0);
        let complete = true;
        let cause: DailyLossCause | null = null;
        const markIncomplete = (kind: DailyLossCause): void => {
            complete = false;
            // First cause wins: the refusal names one concrete remedy.
            if (cause === null) cause = kind;
        };
        let hasSyncedSource = false;

        for (const entry of journalState.entries) {
            if (entry.isPaper === true) continue;
            // Provably outside today: neither the sum nor the completeness
            // verdict may see this entry. `exitDate` alone decides — the open
            // day says nothing about when a position closed.
            if (entry.exitDate) {
                const closeTs = closeTimestamp(entry);
                if (closeTs !== null && (closeTs < dayStart || closeTs > now)) {
                    continue;
                }
            }
            if (!KNOWN_STATUSES.has(entry.status)) {
                markIncomplete("unknown-status");
                continue;
            }
            // Only synced entries that survived the day-scope above can
            // demand a fresh sync: a 2024 Bitunix row must not force a
            // same-day history sync every trading day forever.
            if (entry.isManual === false) hasSyncedSource = true;
            if (!CLOSED_STATUSES.has(entry.status)) continue;
            if (
                (entry.status === "Lost" || entry.status === "Closed") &&
                !isMeasuredAmount(entry)
            ) {
                markIncomplete("no-amount");
                continue;
            }
            // A close without a close day cannot be placed in time. Dating
            // it by its open day would hide an overnight loss from today's
            // limit, so the day reads incomplete instead.
            if (!entry.exitDate) {
                markIncomplete("no-exit-date");
                continue;
            }
            const ts = closeTimestamp(entry);
            if (ts === null) {
                markIncomplete("no-exit-date");
                continue;
            }
            if (ts < dayStart || ts > now) continue;
            total = total.plus(getTradePnL(entry));
        }

        if (hasSyncedSource) {
            const syncedAt = riskState.lastHistorySyncAt;
            if (syncedAt === null || syncedAt < dayStart) markIncomplete("stale-sync");
        }

        return { loss: total, complete, cause };
    }

    /** Today's realised loss as a positive number, or zero if today is up. */
    public realizedLossToday(now = Date.now()): Decimal {
        const pnl = this.realizedPnlToday(now);
        return pnl.isNegative() ? pnl.abs() : new Decimal(0);
    }

    /**
     * The gate's risk-limit hook.
     *
     * Limits apply to orders that open or increase exposure, and to nothing
     * else. A limit that blocked a close would turn a breach into a larger
     * one — the user would be over their limit *and* unable to get out.
     */
    public checkLimits(intent: OrderIntent): OrderRefusal | null {
        if (!this.increasesExposure(intent)) return null;

        // An add (FEAT-0334) gets the limits that need no stop distance the
        // add does not carry. Scaling into a position after the day's loss
        // limit has been reached is the precise behaviour that limit exists
        // to stop, and refusing it needs nothing from the intent. The
        // position-size caps are measurable on an add — notional is quantity
        // × price, and the cap answers how large the position becomes, so the
        // resulting position is measured (BUG-0508). `checkLossPerTrade`
        // measures the add against the resulting position under the resting
        // stop the intent carries, and refuses as unmeasurable when a limit
        // is configured and no stop is known (BUG-0510). `checkOpenPositions`
        // counts positions an add does not create; skipping it is correct.
        if (intent.kind === "add") {
            return (
                this.checkDailyLoss() ??
                this.checkPositionSize(intent) ??
                this.checkLossPerTrade(intent)
            );
        }

        // An amendment that enlarges the resting order makes the exposure
        // larger than the trader approved when it was placed, so the same
        // limits an `open` faces apply to the amended order (BUG-0548).
        // `previousQuantity` vs `modifyQuantity` decides; a price-only
        // amendment states no quantity and stays exempt, as do TP/SL-only
        // amendments — those are returned before any limit runs. A shrinking
        // amendment stays exempt from the size caps — less quantity is less
        // exposure — but still faces the loss-per-trade ceiling, because
        // widening the stop on the way down can push the resulting loss
        // past it (BUG-0567). `checkOpenPositions` stays out: the order
        // consumed its slot when it was first placed. `checkLeverage` stays
        // out: a modify payload carries no leverage.
        if (intent.kind === "modify") {
            if (!this.isQuantityIncreasingModify(intent)) {
                // No quantity stated anywhere means price-only: there is no
                // new exposure to measure, so the full exemption holds. A
                // stated quantity that only shrinks is measured against the
                // resulting position and stop — and refuses as unmeasurable
                // when no stop is known, like every other unverifiable input
                // in this gate.
                if (this.modifyQtyOf(intent) === null) return null;
                return this.checkLossPerTrade(intent);
            }
            return (
                this.checkDailyLoss() ??
                this.checkPositionSize(intent) ??
                this.checkLossPerTrade(intent)
            );
        }

        // Remaining kinds (a reduce only shrinks exposure) carry no size the
        // open/add/modify limits above measure; the kill switch already
        // covers them, and the gate's own field checks cover the rest.
        if (intent.kind !== "open") return null;

        return (
            this.checkDailyLoss() ??
            this.checkOpenPositions(intent) ??
            this.checkLeverage(intent) ??
            this.checkPositionSize(intent) ??
            this.checkLossPerTrade(intent)
        );
    }

    /**
     * The quantity the amended order will carry: what goes on the wire
     * first, what the constructor displayed second. One helper for all
     * three modify reads (increase check, loss, notional) so the same
     * intent cannot measure a different quantity per check.
     */
    private modifyQtyOf(intent: OrderIntent): Decimal | null {
        return toDecimal(intent.payload.qty) ?? toDecimal(intent.displayed.modifyQuantity);
    }

    /**
     * Whether a pending-order amendment makes the order larger than the
     * resting order it replaces (BUG-0548).
     *
     * The new quantity is the payload's (the constructor always sends one,
     * falling back to the live order's own size) and the old one is the
     * `previousQuantity` the constructor merged in. An amendment with no
     * quantity on either side has nothing to enlarge — price-only — and
     * passes; a stated but unmeasurable quantity is measured as an
     * increase. Only a finite, positive `previousQuantity` proves the
     * amendment harmless — absent, null, NaN, infinite, zero or negative
     * cannot, so the limits decide, not the absence of evidence.
     */
    private isQuantityIncreasingModify(intent: OrderIntent): boolean {
        const newQty = this.modifyQtyOf(intent);
        if (newQty === null || !newQty.isFinite()) {
            // Price-only (no quantity stated anywhere) stays exempt; a
            // stated but unmeasurable quantity is measured as an increase —
            // fail closed rather than exempt on garbage.
            return intent.payload.qty !== undefined || intent.displayed.modifyQuantity !== undefined;
        }
        // Only a finite, positive resting size proves the amendment shrinks
        // or holds exposure. Anything else — absent, null, NaN, infinite,
        // zero or negative — is measured as an increase: the limits decide,
        // not the absence of evidence.
        const previous: Decimal | null | undefined = intent.displayed.previousQuantity;
        if (previous === undefined || previous === null || !previous.isFinite() || !previous.gt(0)) return true;
        return newQty.gt(previous);
    }

    private checkDailyLoss(now = Date.now()): OrderRefusal | null {
        const max = riskState.limit("maxDailyLossUsdt");
        if (max === null) return null;
        // BUG-0499: a configured limit over an unmeasurable day refuses with
        // the gate's existing "cannot measure" vocabulary instead of passing
        // on a zero. BUG-0523: the refusal names the cause, so the trader
        // sees the remedy, not just the refusal. Closes, cancels and TP/SL
        // modifications never reach here — `checkLimits` returns them before
        // any limit runs.
        const assessment = this.assessDailyLoss(now);
        if (!assessment.complete) {
            const messageKey =
                assessment.cause !== null
                    ? DAILY_LOSS_CAUSE_KEYS[assessment.cause]
                    : "orderGate.riskLimitUnmeasurable";
            return {
                field: "maxDailyLoss",
                reason: "missing",
                messageKey,
                values: { field: "maxDailyLoss" },
            };
        }
        const loss = assessment.loss.isNegative()
            ? assessment.loss.abs()
            : new Decimal(0);
        if (loss.lt(max)) return null;
        return {
            field: "maxDailyLoss",
            reason: "riskLimit",
            messageKey: "orderGate.riskLimitDailyLoss",
            values: { field: "maxDailyLoss", limit: max.toString(), actual: loss.toString() },
        };
    }

    private checkOpenPositions(intent: OrderIntent): OrderRefusal | null {
        if (riskState.hasInvalidMaxOpenPositions) return invalidRiskState("maxOpenPositions");
        const max = riskState.maxOpenPositions;
        if (max === null) return null;

        const symbol = intent.displayed.symbol;
        const positions = omsService.getPositions();
        if (symbol !== undefined) {
            const sameSymbol = positions.filter((p) => p.symbol === symbol);
            if (sameSymbol.length > 0 && this.mergesIntoHeld(sameSymbol, intent)) return null;
        }

        if (positions.length + 1 > max) {
            return limitRefusal("maxOpenPositions", max, positions.length + 1);
        }
        return null;
    }

    /**
     * Whether an open merges into a position already held on the symbol, so
     * the count does not grow (BUG-0515).
     *
     * One-way mode: an open on a held symbol merges into (or reduces) the
     * existing position — the exemption as it always was. Hedge mode: long
     * and short on one symbol are two independent positions, so only a
     * same-side open merges; the opposite side is a new position and is
     * counted. The mode is read per position (`positionMode`); a symbol with
     * no hedge-marked position keeps the old exemption — Bitget legs and
     * mode-less snapshots cannot prove hedge, and a limit must not refuse
     * ordinary one-way adds on an unprovable mode.
     */
    private mergesIntoHeld(
        sameSymbol: Array<{ side: "long" | "short"; positionMode?: "one_way" | "hedge" }>,
        intent: OrderIntent,
    ): boolean {
        if (!sameSymbol.some((p) => p.positionMode === "hedge")) return true;
        const intentSide = positionSideOf(intent.displayed.side);
        if (intentSide === null) return false;
        return sameSymbol.some((p) => p.side === intentSide);
    }

    private checkLeverage(intent: OrderIntent): OrderRefusal | null {
        const max = riskState.limit("maxLeverage");
        if (max === null) return null;

        const leverage =
            intent.displayed.leverage ?? toDecimal(intent.payload.leverage);
        if (leverage === null) return unmeasurable("maxLeverage");
        if (leverage.gt(max)) return limitRefusal("maxLeverage", max, leverage);
        return null;
    }

    private checkPositionSize(intent: OrderIntent): OrderRefusal | null {
        const maxAbsolute = riskState.limit("maxPositionSizeUsdt");
        const maxPercent = riskState.limit("maxPositionSizePercent");
        if (maxAbsolute === null && maxPercent === null) return null;

        const notional = this.notionalOf(intent);
        if (notional === null || !notional.isFinite()) return unmeasurable("maxPositionSize");

        if (maxAbsolute !== null && notional.gt(maxAbsolute)) {
            return limitRefusal("maxPositionSize", maxAbsolute, notional);
        }

        if (maxPercent !== null) {
            const equity = intent.displayed.accountSize;
            if (equity === undefined) return unmeasurable("maxPositionSizePercent");
            const cap = equity.times(maxPercent).div(100);
            if (!cap.isFinite()) return unmeasurable("maxPositionSizePercent");
            if (notional.gt(cap)) {
                return limitRefusal("maxPositionSizePercent", cap, notional);
            }
        }

        return null;
    }

    private checkLossPerTrade(intent: OrderIntent): OrderRefusal | null {
        const max = riskState.limit("maxLossPerTradeUsdt");
        if (max === null) return null;

        // An add moves both sides of the risk equation — the size behind the
        // stop and the distance from the new average entry to it — so it is
        // measured against the resulting position under the resting stop the
        // intent carries (BUG-0510). No stop on the intent means the position
        // is unprotected: with a configured limit that is unmeasurable risk,
        // not approved risk.
        if (intent.kind === "add") {
            const { entryPrice, restingStopPrice, positionAmount, positionEntryPrice } = intent.displayed;
            const qty = toDecimal(intent.payload.qty);
            if (
                qty === null ||
                entryPrice === undefined ||
                restingStopPrice === undefined ||
                positionAmount === undefined ||
                positionEntryPrice === undefined
            ) {
                return unmeasurable("maxLossPerTrade");
            }
            // The weighted mean previewAdd owns, recomputed here from the
            // displayed inputs rather than trusted from the constructor.
            const resultingAmount = positionAmount.plus(qty);
            const resultingEntry = positionEntryPrice
                .times(positionAmount)
                .plus(entryPrice.times(qty))
                .div(resultingAmount);
            const loss = this.lossWithFees(
                intent,
                resultingAmount,
                resultingEntry,
                restingStopPrice,
            );
            if (loss === null || !loss.isFinite()) return unmeasurable("maxLossPerTrade");
            if (loss.gt(max)) return limitRefusal("maxLossPerTrade", max, loss);
            return null;
        }

        // An enlarged amendment is measured like an open (BUG-0548): the
        // quantity the order will carry, the price it rests at, and the stop
        // it will be attached to — payload values first, displayed values
        // as fallback, because the wire executes the payload. The
        // constructor displays exactly what it sends, so both agree there.
        // No stop
        // anywhere means unprotected exposure: with a configured limit that
        // is unmeasurable, not approved (BUG-0510).
        if (intent.kind === "modify") {
            const qty = this.modifyQtyOf(intent);
            const entryPrice =
                toDecimal(intent.payload.price) ?? intent.displayed.entryPrice;
            const stopLossPrice =
                toDecimal(intent.payload.slPrice) ?? intent.displayed.stopLossPrice;
            if (qty === null || entryPrice == null || stopLossPrice == null) {
                return unmeasurable("maxLossPerTrade");
            }
            const loss = this.lossWithFees(intent, qty, entryPrice, stopLossPrice);
            if (loss === null || !loss.isFinite()) return unmeasurable("maxLossPerTrade");
            if (loss.gt(max)) return limitRefusal("maxLossPerTrade", max, loss);
            return null;
        }

        const qty = toDecimal(intent.payload.qty);
        const { entryPrice, stopLossPrice } = intent.displayed;
        if (qty === null || entryPrice === undefined || stopLossPrice === undefined) {
            return unmeasurable("maxLossPerTrade");
        }

        // The loss the stop would realise, *including* the round-trip fee
        // (BUG-0500). The entry fee is already paid when the stop triggers
        // and the exit fee is charged on the way out; measuring without them
        // under-reports every time, in the same direction. Slippage stays
        // out — unknowable at gate time, and a different question.
        const loss = this.lossWithFees(intent, qty, entryPrice, stopLossPrice);
        if (loss === null) return unmeasurable("maxLossPerTrade");
        if (loss.gt(max)) return limitRefusal("maxLossPerTrade", max, loss);
        return null;
    }

    /**
     * Stop distance plus both fee legs, in quote currency — or null when a
     * leg's rate cannot be resolved (BUG-0500). The exit leg at a stop is a
     * taker fill; the entry leg follows the order type the intent carries.
     * Rates are percentages, so each leg divides by 100 exactly once.
     */
    private lossWithFees(
        intent: OrderIntent,
        qty: Decimal,
        entry: Decimal,
        stop: Decimal,
    ): Decimal | null {
        const venue = intent.displayed.provider;
        const paperMode = intent.displayed.paperMode;
        const entryRate = feeRateFor(entryRoleOf(intent.payload.orderType), venue, paperMode);
        const exitRate = feeRateFor("taker", venue, paperMode);
        if (entryRate === null || exitRate === null) return null;
        const move = entry.minus(stop).abs().times(qty);
        const entryFee = qty.times(entry).times(entryRate).div(100);
        const exitFee = qty.times(stop).times(exitRate).div(100);
        return move.plus(entryFee).plus(exitFee);
    }

    /**
     * Order value in quote currency: quantity × entry price. For an `add`
     * the cap answers how large the position becomes, so the resulting
     * position is measured (`positionAmount + addQuantity`), not the leg
     * alone — for an open the two are identical (BUG-0508). An add that
     * does not state the position it grows is unmeasurable rather than
     * capped per-leg: capping each leg alone would let ten of them through.
     */
    private notionalOf(intent: OrderIntent): Decimal | null {
        const qty =
            intent.kind === "modify" ? this.modifyQtyOf(intent) : toDecimal(intent.payload.qty);
        if (qty === null) return null;
        // A modify is capped on what the wire executes — payload first,
        // displayed as fallback, like the loss branch above. Other kinds
        // keep the displayed-first order.
        const price =
            intent.kind === "modify"
                ? (toDecimal(intent.payload.price) ?? intent.displayed.entryPrice ?? null)
                : (intent.displayed.entryPrice ?? toDecimal(intent.payload.price));
        if (price === null) return null;
        if (intent.kind === "add") {
            const positionAmount = intent.displayed.positionAmount;
            if (positionAmount === undefined) return null;
            return positionAmount.plus(qty).times(price);
        }
        return qty.times(price);
    }

    /**
     * Background monitor for active positions.
     * Can trigger emergency exits if drawdown exceeds limits.
     */
    public monitorRisk(): void {
        try {
            const positions = omsService.getPositions();

            if (!positions || !Array.isArray(positions)) {
                logger.debug("data", "[RMS] Invalid positions array, skipping cycle");
                return;
            }

            positions.forEach(pos => {
                if (!pos) return;

                // Validate critical fields
                if (!pos.unrealizedPnl || !(pos.unrealizedPnl instanceof Decimal)) {
                    logger.warn("data", `[RMS] Invalid unrealizedPnl for ${pos.symbol}, skipping position check`);
                    return;
                }

                // Logic to check if position is in danger zone
                if (pos.unrealizedPnl.isNegative()) {
                    // We assume pnl is in USDT if comparing to size,
                    // or percent if compared to drawdown limit.
                    // Let's keep it placeholder as in the original but with safe checks.
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const pnlAbs = pos.unrealizedPnl.abs();
                }
            });
        } catch (e) {
            logger.error("data", "[RMS] Risk monitor cycle failed", e);
        }
    }
}

export const rmsService = new RiskManagementService();
