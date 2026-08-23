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

/**
 * Turning a Bitunix TP/SL row into the plans the rest of the app expects —
 * BUG-0266.
 *
 * ## The mismatch this exists to close
 *
 * `TpSlOrder` models **one leg**: it has a single `planType` and a single
 * `triggerPrice`. Bitunix returns **one row carrying both legs** — `tpPrice`
 * and `slPrice` together, each with its own stop type, order type and
 * quantity (`06_tp_sl.md` §Get Pending TP/SL Order). The row carries neither
 * `planType` nor `triggerPrice`.
 *
 * Nothing bridged the two. `fetchTpSlOrders` passed the raw rows through, and
 * `tpSlState.planTypeOf` read a `planType` that was never there, so
 * `plansFor()` skipped every plan and answered *no stop* for positions that
 * had one.
 *
 * ## Why the leg id is formed the way it is
 *
 * `tpSlState.updateFromWs` already splits the WebSocket push into legs and
 * names them `${orderId}-tp` / `${orderId}-sl`. This function uses the same
 * shape deliberately: a live push must *update* the row a fetch created, and
 * two different id schemes would leave the list holding both — one stale, one
 * live, indistinguishable on screen.
 *
 * That relies on the row's `id` and the WS push's `orderId` being the same
 * identifier under two names. The documented shapes agree (both are the TP/SL
 * order id, and the create endpoints return it as `orderId`), but this has not
 * been confirmed against a live account; if it turns out false, the symptom is
 * a duplicated plan rather than a wrong price.
 */

import type { TpSlOrder } from "./tradeService";

/** One leg's worth of fields, as they are named on the wire. */
interface LegFields {
    price?: string;
    stopType?: string;
    orderType?: string;
    orderPrice?: string;
    qty?: string;
}

function readLeg(row: Record<string, unknown>, prefix: "tp" | "sl"): LegFields {
    const str = (key: string): string | undefined => {
        const value = row[key];
        if (value === undefined || value === null || value === "") return undefined;
        return String(value);
    };
    return {
        price: str(`${prefix}Price`),
        stopType: str(`${prefix}StopType`),
        orderType: str(`${prefix}OrderType`),
        orderPrice: str(`${prefix}OrderPrice`),
        qty: str(`${prefix}Qty`),
    };
}

/**
 * Splits one Bitunix TP/SL row into one `TpSlOrder` per leg it actually
 * carries — two for a row with both, one for a row with only a stop, and none
 * for a row with neither.
 *
 * A row already shaped as a single leg (one carrying `planType`, as the
 * generic non-Bitunix path and the WS split produce) is returned unchanged.
 * That keeps this safe to apply to a mixed list and keeps it idempotent, which
 * matters because a normalised list can be re-normalised by a later refetch
 * path without anyone noticing.
 */
export function normalizeTpSlRow(raw: unknown): TpSlOrder[] {
    if (raw === null || typeof raw !== "object") return [];
    const row = raw as Record<string, unknown>;

    const symbol = row.symbol === undefined ? "" : String(row.symbol);
    if (!symbol) return [];

    // Already one leg — the WS split and the generic provider both produce
    // this shape. Passing it through unchanged is what makes the function
    // idempotent.
    if (row.planType !== undefined && row.planType !== null && row.planType !== "") {
        return [row as unknown as TpSlOrder];
    }

    const baseId =
        row.id !== undefined && row.id !== null && row.id !== ""
            ? String(row.id)
            : row.orderId !== undefined && row.orderId !== null && row.orderId !== ""
              ? String(row.orderId)
              : row.planId !== undefined && row.planId !== null && row.planId !== ""
                ? String(row.planId)
                : "";
    if (!baseId) return [];

    const status = row.status === undefined ? "NEW" : String(row.status);
    const positionId =
        row.positionId === undefined || row.positionId === null
            ? undefined
            : String(row.positionId);
    const ctime = typeof row.ctime === "number" ? row.ctime : undefined;
    const createTime = typeof row.createTime === "number" ? row.createTime : undefined;

    const plans: TpSlOrder[] = [];

    const build = (
        prefix: "tp" | "sl",
        planType: "PROFIT" | "LOSS",
    ): void => {
        const leg = readLeg(row, prefix);
        // No price, no plan. A row can carry one leg only, and inventing the
        // other would put a stop on screen that the venue does not hold.
        if (leg.price === undefined) return;

        plans.push({
            // Same scheme as `updateFromWs`, so a live push replaces this row
            // rather than appending beside it.
            orderId: `${baseId}-${prefix}`,
            symbol,
            planType,
            triggerPrice: leg.price,
            status,
            ...(leg.qty !== undefined ? { qty: leg.qty } : {}),
            ...(leg.stopType !== undefined ? { workingType: leg.stopType } : {}),
            ...(leg.orderPrice !== undefined ? { price: leg.orderPrice } : {}),
            ...(leg.orderType !== undefined ? { orderType: leg.orderType } : {}),
            ...(positionId !== undefined ? { positionId } : {}),
            ...(ctime !== undefined ? { ctime } : {}),
            ...(createTime !== undefined ? { createTime } : {}),
            // The row this leg came from, so a cancel can still address the
            // plan the venue knows about rather than the leg id invented here.
            sourceOrderId: baseId,
            /*
             * Whether this is the position-wide plan or a partial one.
             *
             * Inferred from the presence of a quantity: a position-wide plan
             * tracks the position's size and names none, a partial plan names
             * the size it covers. This is **inference, not documentation** —
             * the response carries no field saying which kind a row is — so it
             * is recorded as a named guess rather than folded silently into
             * some other flag. A consumer that would place an order on the
             * strength of it should confirm it first; see BUG-0266.
             */
            scopeGuess: leg.qty === undefined ? "position" : "partial",
        } as TpSlOrder);
    };

    build("tp", "PROFIT");
    build("sl", "LOSS");

    return plans;
}

/** Normalises a whole response, dropping rows that carry no usable leg. */
export function normalizeTpSlRows(rows: readonly unknown[]): TpSlOrder[] {
    return rows.flatMap((row) => normalizeTpSlRow(row));
}
