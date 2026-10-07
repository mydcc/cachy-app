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
 * BUG-0649 — which of the two stop-loss notes a venue needs.
 *
 * The matrix is asserted in full rather than only for the two venues in the
 * table, because the bug was a condition that asked one question where two were
 * asked: the order form showed "the stop is placed as a second request" on a
 * venue that cannot place it, and the gate two lines below refused it.
 */

import { describe, expect, it } from "vitest";
import { canCarryStopLoss, stopLossPlacement } from "./stopLossPlacement";

const caps = (tpSlAtEntry: boolean, tpSlStandalone: boolean) => ({
    tpSlAtEntry,
    tpSlStandalone,
});

describe("BUG-0649 — where a venue can carry a stop loss", () => {
    it("carries a stop when either path exists", () => {
        expect(canCarryStopLoss(caps(true, true))).toBe(true);
        expect(canCarryStopLoss(caps(true, false))).toBe(true);
        expect(canCarryStopLoss(caps(false, true))).toBe(true);
        expect(canCarryStopLoss(caps(false, false))).toBe(false);
    });

    it("names the path rather than a single yes/no", () => {
        expect(stopLossPlacement(caps(true, true))).toBe("attached");
        // Attaches: nothing to warn about even though standalone is also true.
        expect(stopLossPlacement(caps(true, false))).toBe("attached");
        // The case the old note claimed and this one states truthfully.
        expect(stopLossPlacement(caps(false, true))).toBe("separate");
        // Bitget today: neither, so the entry can only go out unprotected.
        expect(stopLossPlacement(caps(false, false))).toBe("unprotected");
    });

    it("keeps 'separate' and 'unprotected' distinct — they need different words", () => {
        // The bug was the note promising a second request on a venue that cannot
        // send one. If these two ever collapsed again, the form would be making
        // the same promise.
        expect(stopLossPlacement(caps(false, true))).not.toBe(
            stopLossPlacement(caps(false, false)),
        );
    });
});