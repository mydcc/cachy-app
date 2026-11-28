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

import { Decimal } from "decimal.js";

/** The part of a netted paper position that belongs to its bot/grid. */
export interface GridPositionShareInput {
    amount: string;
    entryPrice: string;
    side: "long" | "short";
    gridOwnedAmount?: string;
    gridEntryPrice?: string;
}

/** Legacy bot positions predate the split fields; their whole amount was the bot's. */
export function gridOwnedAmount(position: GridPositionShareInput): Decimal {
    return position.gridOwnedAmount
        ? new Decimal(position.gridOwnedAmount)
        : new Decimal(position.amount);
}

export function gridEntryPrice(position: GridPositionShareInput): Decimal {
    return position.gridEntryPrice
        ? new Decimal(position.gridEntryPrice)
        : new Decimal(position.entryPrice);
}

/** Mark-to-market for the bot/grid share only, never for a manual add merged into it. */
export function gridUnrealizedPnl(
    position: GridPositionShareInput,
    mark: Decimal | null | undefined,
): Decimal | null {
    if (!mark || !mark.isFinite() || mark.lte(0)) return null;
    const amount = gridOwnedAmount(position);
    const entry = gridEntryPrice(position);
    return position.side === "long"
        ? mark.minus(entry).times(amount)
        : entry.minus(mark).times(amount);
}
