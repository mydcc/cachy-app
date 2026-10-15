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
 * BUG-0687 — the gate over the modify-position intent.
 *
 * The direction rule (`checkTpSlDirection`) runs over *every* leg on the wire,
 * which is what makes it meaningful here: the add-a-leg request carries the
 * existing leg as well, so a stale carried-over level is caught before it can
 * move the plan onto a trigger that fires the other way. And the intent has to
 * be classified as mutating at all, or `assertGatePass` would wave it through
 * without a pass — the sibling rule is exercised in `orderGate.test.ts`.
 *
 * Intents mirror `tradeService.modifyPositionTpSl` (kind "modify", endpoint
 * "/api/tpsl", `params.*` price paths).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Decimal } from "decimal.js";
import {
    orderGate,
    registerKillSwitch,
    registerRiskLimitCheck,
    type OrderIntent,
} from "./orderGate";

const ACCOUNT = {
    provider: "bitunix",
    accountFingerprint: "abcd…wxyz",
    accountId: "bitunix-first",
};

function modifyPositionIntent(
    side: string,
    entry: string,
    sl: string | undefined,
    tp: string | undefined,
): OrderIntent {
    const params: Record<string, unknown> = {};
    if (sl !== undefined) params.slPrice = sl;
    if (tp !== undefined) params.tpPrice = tp;
    return {
        kind: "modify",
        endpoint: "/api/tpsl",
        payload: {
            exchange: "bitunix",
            action: "modify-position",
            symbol: "BTCUSDT",
            params: { symbol: "BTCUSDT", positionId: "pos-1", ...params },
        },
        displayed: {
            ...ACCOUNT,
            symbol: "BTCUSDT",
            positionId: "pos-1",
            positionSide: side,
            entryPrice: new Decimal(entry),
            stopLossPrice: sl !== undefined && sl !== "" ? new Decimal(sl) : undefined,
            takeProfits: tp !== undefined && tp !== "" ? [new Decimal(tp)] : undefined,
        },
        priceFields: {
            takeProfit: "params.tpPrice",
            stopLoss: "params.slPrice",
        },
    };
}

beforeEach(() => {
    registerKillSwitch(null);
    registerRiskLimitCheck(null);
});

afterEach(() => {
    registerKillSwitch(null);
    registerRiskLimitCheck(null);
});

describe("orderGate — modify-position carries both legs (BUG-0687)", () => {
    it("approves the case the defect produced: a target stands, the stop is added", () => {
        // Both levels on the wire, both on the correct side of entry.
        const verdict = orderGate.verify(
            modifyPositionIntent("LONG", "50000", "49500", "51000"),
        );
        expect(verdict.refusal).toBeNull();
        expect(verdict.approved).toBe(true);
        expect(verdict.checked).toContain("tpSlDirection");
    });

    it("approves the mirror: a stop stands, the target is added", () => {
        const verdict = orderGate.verify(
            modifyPositionIntent("LONG", "50000", "49500", "51000"),
        );
        expect(verdict.approved).toBe(true);
    });

    it("refuses when the carried-over target sits on the wrong side", () => {
        // A stale level must not travel just because it already exists.
        const verdict = orderGate.verify(
            modifyPositionIntent("LONG", "50000", "49500", "49000"),
        );
        expect(verdict.approved).toBe(false);
        expect(verdict.refusal?.field).toBe("takeProfit");
        expect(verdict.refusal?.messageKey).toBe("orderGate.invalidTpSl");
    });

    it("refuses when the newly added stop sits on the wrong side", () => {
        const verdict = orderGate.verify(
            modifyPositionIntent("LONG", "50000", "50500", "51000"),
        );
        expect(verdict.approved).toBe(false);
        expect(verdict.refusal?.field).toBe("stopLoss");
    });
});
