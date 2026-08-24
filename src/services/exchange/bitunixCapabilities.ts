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
 * What Bitunix accepts on an order — Bitunix's own declaration (FEAT-0017).
 *
 * Nothing else in `src/` may edit this file to change another venue's answer,
 * and this file imports nothing at runtime, so `orderGate` can read it without
 * inheriting the transport graph.
 *
 * Every entry below cites what makes it true. An entry with no citation does
 * not belong here.
 */

import type { ExchangeCapabilities } from "./capabilityTypes";

export const bitunixCapabilities: ExchangeCapabilities = Object.freeze({
    // Trigger orders are absent on purpose: the plan-order endpoint family is
    // missing from the doc crawl (see INTEGRATION_STATUS.md's TODO), so Cachy
    // has no verified request shape for one. It goes in when the crawl covers
    // it, not before.
    orderTypes: Object.freeze(["market", "limit"] as const),

    // `tradeService.placeOrder` writes tpPrice/slPrice onto the place-order
    // payload itself, so entry and protection are one request.
    tpSlAtEntry: true,

    // place-order carries `effect` for a LIMIT order; MARKET ignores it.
    timeInForce: Object.freeze(["GTC", "IOC", "FOK", "POST_ONLY"] as const),

    // place_order carries exactly one tpPrice/slPrice pair. A ladder of
    // targets needs batch_order or the tpsl endpoints (FEAT-0070/0071).
    multipleTakeProfits: false,

    // Both spellings arrive on the positions route and are normalised there
    // ("ISOLATION"|"CROSS" → isolated|cross, routes/api/positions/+server.ts),
    // and `fetchLeverageMarginMode` reads the pair back per symbol.
    marginModes: Object.freeze(["cross", "isolated"] as const),

    // HEDGE and ONE_WAY both occur: `mappers.ts` normalises them, and
    // `buildCloseOrderFields` in tradeService exists precisely because closing
    // a HEDGE position needs positionId + tradeSide (BUG-0062/BUG-0063).
    positionModes: Object.freeze(["one_way", "hedge"] as const),

    // No trailing-stop wire format exists anywhere in Cachy. The venue may
    // well support one; claiming it before the request shape is verified is
    // what BUG-0001 cost a release to teach.
    trailingStop: false,
});
