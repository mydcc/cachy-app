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

/*
 * Where a venue can carry a stop loss — BUG-0649.
 *
 * A venue has two ways to take one: attached to the entry order, or as its own
 * order afterwards. Whether it can do the second is a separate fact from the
 * first, and the two used to be decided in two places that answered different
 * questions.
 *
 * The order form asked only "can it attach?" and, when the answer was no, told
 * the trader the stop "is placed as a second request". The gate asked both and
 * refused when the answer was no twice. With the capability table as it stands
 * the form's note was therefore never true where it appeared: Bitunix attaches
 * (so the note never shows) and Bitget does neither (so the note shows and the
 * gate refuses it two lines below).
 *
 * One predicate, both call sites. A duplicated condition is what produced the
 * contradiction, and a shared one is what prevents the next venue from
 * reintroducing it.
 */

import type { ExchangeCapabilities } from "../exchangeCapabilities";

/**
 * Whether a venue can carry a stop on this order at all — attached, or as a
 * separate order afterwards.
 *
 * The gate refuses a stop it cannot place; the order form has to say so before
 * the trader presses the button. Both read this.
 */
export function canCarryStopLoss(caps: {
    tpSlAtEntry: boolean;
    tpSlStandalone: boolean;
}): boolean {
    return caps.tpSlAtEntry || caps.tpSlStandalone;
}

/**
 * Which of the two things the trader needs to be told applies here.
 *
 * `separate` — the venue cannot attach, but places the stop itself, so the
 * position is briefly naked until that order lands.
 * `unprotected` — neither. The entry can only go out without the stop, and that
 * is a decision to make before sending it, not after a refusal.
 * `attached` — nothing to warn about.
 */
export type StopLossPlacement = "attached" | "separate" | "unprotected";

export function stopLossPlacement(caps: Pick<ExchangeCapabilities, "tpSlAtEntry" | "tpSlStandalone">): StopLossPlacement {
    if (caps.tpSlAtEntry) return "attached";
    return caps.tpSlStandalone ? "separate" : "unprotected";
}