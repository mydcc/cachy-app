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
 * FEAT-0017 — the vocabulary a venue uses to describe itself.
 *
 * Types only, and deliberately import-free. Everything downstream of this
 * file — the per-venue declarations, the aggregator, `orderGate` — inherits
 * that emptiness, which is the point: `orderGate` promises "no network, no
 * store reads, no side effects" and imports nothing but `decimal.js`. Routing
 * capability lookups through the adapter registry instead would have dragged
 * `apiService`, both WebSocket services, `tradeService` and `settingsState`
 * into the one module that has to stay verifiable on its own.
 *
 * The declarations live one per venue (`bitunixCapabilities.ts`,
 * `bitgetCapabilities.ts`) so that widening one venue cannot narrow another.
 */

/** Entry types the UI may offer. */
export type OrderEntryType = "market" | "limit" | "trigger";

export type TimeInForce = "GTC" | "IOC" | "FOK" | "POST_ONLY";

/** How margin is shared. Normalised spelling; venues disagree ("ISOLATION"). */
export type MarginMode = "cross" | "isolated";

/** Whether opposing positions in one symbol can coexist. */
export type PositionMode = "one_way" | "hedge";

/**
 * What a venue accepts on an order, as that venue declares about itself.
 *
 * The bar for a `true` or for a value in a list is *two* facts, not one: the
 * venue supports it **and** Cachy has a verified request shape for it. A venue
 * feature Cachy cannot yet spell is declared absent — the flag exists to stop
 * the UI offering a control, and a control that submits an unverified shape
 * fails after the trader has committed, which is the expensive direction.
 *
 * Contrast `TradingSupport` in `./types.ts`: that says which verbs Cachy has
 * wired end-to-end, this says what the venue will take.
 */
export interface ExchangeCapabilities {
    /** Entry types the UI may offer. */
    orderTypes: readonly OrderEntryType[];
    /**
     * Whether a stop and target can ride along with the entry in one request.
     * False means they have to be placed afterwards, which opens a window in
     * which the position exists unprotected — see `orderPlacementService`.
     */
    tpSlAtEntry: boolean;
    /** Time-in-force values accepted on a limit order; empty means none. */
    timeInForce: readonly TimeInForce[];
    /** Whether more than one take-profit level can be attached at entry. */
    multipleTakeProfits: boolean;
    /** Margin modes the venue reports and accepts; empty means unknown. */
    marginModes: readonly MarginMode[];
    /** Position modes the venue reports and accepts; empty means unknown. */
    positionModes: readonly PositionMode[];
    /**
     * Whether a trailing stop can be attached to an order. False everywhere
     * today: the only "trailing" in the codebase is the ATR trailing-stop
     * *indicator*, which draws a line on a chart and places nothing.
     */
    trailingStop: boolean;
}
