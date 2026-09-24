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
 * BUG-0550 — the TP/SL direction rule at the gate (`checkTpSlDirection`).
 *
 * The calculator proves the arithmetic; these prove the gate applies it on
 * the wire values for both sides, refuses an unreadable side instead of
 * defaulting it to short, and refuses an empty-string level as invalid
 * rather than skipping it. Intents mirror `tradeService.placePositionTpSl`
 * (kind "modify", endpoint "/api/tpsl", `params.*` price paths).
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

function tpslIntent(
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
            action: "place-position",
            symbol: "BTCUSDT",
            positionId: "pos-1",
            params,
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

describe("orderGate — TP/SL direction (BUG-0550)", () => {
    it("approves a short stop above the entry and a short target below it", () => {
        const verdict = orderGate.verify(tpslIntent("SHORT", "50000", "50500", "49500"));
        expect(verdict.refusal).toBeNull();
        expect(verdict.approved).toBe(true);
        expect(verdict.checked).toContain("tpSlDirection");
    });

    it("approves a long stop below the entry and a long target above it", () => {
        const verdict = orderGate.verify(tpslIntent("LONG", "50000", "49500", "51000"));
        expect(verdict.refusal).toBeNull();
        expect(verdict.approved).toBe(true);
    });

    it("refuses a short stop below the entry, naming the stop", () => {
        const verdict = orderGate.verify(tpslIntent("SHORT", "50000", "49500", undefined));
        expect(verdict.approved).toBe(false);
        expect(verdict.refusal?.field).toBe("stopLoss");
        expect(verdict.refusal?.reason).toBe("unsupported");
        expect(verdict.refusal?.messageKey).toBe("orderGate.invalidTpSl");
    });

    it("refuses a long target below the entry, naming the target", () => {
        const verdict = orderGate.verify(tpslIntent("LONG", "50000", undefined, "49500"));
        expect(verdict.approved).toBe(false);
        expect(verdict.refusal?.field).toBe("takeProfit");
    });

    it("carries the executed values on a direction refusal", () => {
        const verdict = orderGate.verify(tpslIntent("SHORT", "50000", "49500", undefined));
        expect(verdict.refusal?.values).toMatchObject({
            field: "stopLoss",
            actual: "49500",
            entryPrice: "50000",
            side: "SHORT",
        });
    });

    it("refuses an unreadable position side instead of defaulting it to short", () => {
        const verdict = orderGate.verify(tpslIntent("SIDEWAYS", "50000", "50500", undefined));
        expect(verdict.approved).toBe(false);
        expect(verdict.refusal?.field).toBe("side");
        expect(verdict.refusal?.reason).toBe("missing");
    });

    it("refuses an empty-string level as invalid rather than skipping it", () => {
        const verdict = orderGate.verify(tpslIntent("SHORT", "50000", "", undefined));
        expect(verdict.approved).toBe(false);
        expect(verdict.refusal?.field).toBe("stopLoss");
        expect(verdict.refusal?.reason).toBe("unsupported");
    });
});
