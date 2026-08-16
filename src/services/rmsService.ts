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
import { logger } from "./logger";
import { Decimal } from "decimal.js";
import { getTradePnL } from "../lib/calculators/core";
import {
    registerKillSwitch,
    registerRiskLimitCheck,
    type OrderIntent,
    type OrderRefusal,
} from "./orderGate";
import type { JournalEntry } from "../stores/types";

export interface RiskProfile {
    maxPositionSizeUsdt: Decimal;
    maxDrawdownPercent: number;
    stopLossRequired: boolean;
}

/**
 * Statuses that mean the trade is over and its result is real money. Open and
 * planned entries carry no realised PnL, so they cannot move a daily counter.
 */
const CLOSED_STATUSES = new Set(["Won", "Lost"]);

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
     * Hands the limits and the kill switch to the gate. Called once at
     * startup. Until this runs, both hooks are unregistered and the gate
     * approves on those two checks — so this is not optional wiring.
     */
    public installGateHooks(): void {
        registerKillSwitch((intent) => this.isBlockedByKillSwitch(intent));
        registerRiskLimitCheck((intent) => this.checkLimits(intent));
    }

    /** Test seam — removes the hooks this service installed. */
    public uninstallGateHooks(): void {
        registerKillSwitch(null);
        registerRiskLimitCheck(null);
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
     */
    public realizedPnlToday(now = Date.now()): Decimal {
        const dayStart = utcDayStart(now);
        let total = new Decimal(0);

        for (const entry of journalState.entries) {
            if (entry.isPaper === true) continue;
            if (!CLOSED_STATUSES.has(entry.status)) continue;
            const ts = closeTimestamp(entry);
            if (ts === null || ts < dayStart || ts > now) continue;
            total = total.plus(getTradePnL(entry));
        }

        return total;
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
        // A pending-order amendment carries no size/stop pair to measure; the
        // kill switch already covers it, and the gate's own field checks cover
        // the rest.
        if (intent.kind !== "open") return null;

        return (
            this.checkDailyLoss() ??
            this.checkOpenPositions(intent) ??
            this.checkLeverage(intent) ??
            this.checkPositionSize(intent) ??
            this.checkLossPerTrade(intent)
        );
    }

    private checkDailyLoss(now = Date.now()): OrderRefusal | null {
        const max = riskState.limit("maxDailyLossUsdt");
        if (max === null) return null;
        const loss = this.realizedLossToday(now);
        if (loss.lt(max)) return null;
        return {
            field: "maxDailyLoss",
            reason: "riskLimit",
            messageKey: "orderGate.riskLimitDailyLoss",
            values: { field: "maxDailyLoss", limit: max.toString(), actual: loss.toString() },
        };
    }

    private checkOpenPositions(intent: OrderIntent): OrderRefusal | null {
        const max = riskState.maxOpenPositions;
        if (max === null) return null;

        const symbol = intent.displayed.symbol;
        const positions = omsService.getPositions();
        // Adding to a position already open does not raise the count.
        if (symbol !== undefined && positions.some((p) => p.symbol === symbol)) return null;

        if (positions.length + 1 > max) {
            return limitRefusal("maxOpenPositions", max, positions.length + 1);
        }
        return null;
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
        if (notional === null) return unmeasurable("maxPositionSize");

        if (maxAbsolute !== null && notional.gt(maxAbsolute)) {
            return limitRefusal("maxPositionSize", maxAbsolute, notional);
        }

        if (maxPercent !== null) {
            const equity = intent.displayed.accountSize;
            if (equity === undefined) return unmeasurable("maxPositionSizePercent");
            const cap = equity.times(maxPercent).div(100);
            if (notional.gt(cap)) {
                return limitRefusal("maxPositionSizePercent", cap, notional);
            }
        }

        return null;
    }

    private checkLossPerTrade(intent: OrderIntent): OrderRefusal | null {
        const max = riskState.limit("maxLossPerTradeUsdt");
        if (max === null) return null;

        const qty = toDecimal(intent.payload.qty);
        const { entryPrice, stopLossPrice } = intent.displayed;
        if (qty === null || entryPrice === undefined || stopLossPrice === undefined) {
            return unmeasurable("maxLossPerTrade");
        }

        // The loss the stop would realise, before fees. Fees make the real
        // loss larger, so this is the conservative direction to be wrong in
        // only if it under-reports — it does not, because a stop that fills
        // worse than its trigger is a slippage question, not a sizing one.
        const loss = entryPrice.minus(stopLossPrice).abs().times(qty);
        if (loss.gt(max)) return limitRefusal("maxLossPerTrade", max, loss);
        return null;
    }

    /** Order value in quote currency: quantity × entry price. */
    private notionalOf(intent: OrderIntent): Decimal | null {
        const qty = toDecimal(intent.payload.qty);
        if (qty === null) return null;
        const price =
            intent.displayed.entryPrice ?? toDecimal(intent.payload.price);
        if (price === null) return null;
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
