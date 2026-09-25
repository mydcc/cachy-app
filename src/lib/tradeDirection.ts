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

import { CONSTANTS } from "./constants";

export type TradeDirection = "long" | "short";

/** Normalize persisted or preset directions without turning unknown values into long. */
export function normalizeTradeDirection(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isTradeDirection(value: unknown): value is TradeDirection {
  return value === CONSTANTS.TRADE_TYPE_LONG || value === CONSTANTS.TRADE_TYPE_SHORT;
}
