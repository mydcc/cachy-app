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
 * What Bitget accepts on an order — Bitget's own declaration (FEAT-0017).
 *
 * Deliberately narrow, and narrower than the venue itself. Bitget genuinely
 * supports attached TP/SL and conditional orders; Cachy has no *verified* wire
 * format for either, and `routes/api/tpsl/+server.ts` rejects every exchange
 * but Bitunix. Declaring what the venue can do rather than what Cachy can
 * spell would produce a UI control whose submission is refused downstream —
 * after the trader committed.
 *
 * Widening any line here means: verify the request shape first, then add a
 * test, then flip the value. Not the other way round.
 */

import type { ExchangeCapabilities } from "./capabilityTypes";

export const bitgetCapabilities: ExchangeCapabilities = Object.freeze({
    orderTypes: Object.freeze(["market", "limit"] as const),

    // No verified attached-TP/SL shape. `orderPlacementService` reads this and
    // places protection as a separate step, which is why the unprotected
    // window it guards against exists at all.
    tpSlAtEntry: false,

    // Empty, not a guess: Cachy sends no `effect` on the Bitget path, so no
    // value here has been observed accepted.
    timeInForce: Object.freeze([] as const),

    multipleTakeProfits: false,

    // Bitget's positions response carries marginMode and is normalised
    // alongside Bitunix's in routes/api/positions/+server.ts.
    marginModes: Object.freeze(["cross", "isolated"] as const),

    // Unknown rather than one_way: no Bitget response Cachy reads carries a
    // position mode, so there is nothing to declare. Empty means "do not
    // offer the control", which is the safe reading of an unknown.
    positionModes: Object.freeze([] as const),

    trailingStop: false,
    addToPosition: true,
});
