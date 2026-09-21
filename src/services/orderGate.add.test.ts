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
 * The gate's `add` path — FEAT-0334.
 *
 * Same shape as `orderGate.test.ts`: build an intent the gate approves, then
 * break exactly one field and assert it refuses and names that field.
 *
 * The point of this file is that an add is verified *differently* from an
 * open, and deliberately so. An open's size is re-derived from account size,
 * risk and stop distance; an add has no new stop, so it is verified against
 * the quantity the panel showed and against available margin — the only
 * ceiling an add actually has.
 */

import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import { orderGate, MAX_ACCOUNT_STATE_AGE_MS, type OrderIntent } from "./orderGate";

const ACCOUNT = {
    provider: "bitunix",
    accountFingerprint: "abcd…wxyz",
    accountId: "bitunix-first",
};

/**
 * A well-formed add: 0.5 BTC onto an existing long, at a 50 000 limit, 10×.
 * Notional 25 000, so 2 500 margin against 5 000 available.
 */
function addIntent(): OrderIntent {
    return {
        kind: "add",
        endpoint: "/api/orders",
        payload: {
            type: "place-order",
            symbol: "BTCUSDT",
            side: "BUY",
            orderType: "LIMIT",
            qty: "0.5",
            price: "50000",
            reduceOnly: false,
            tradeSide: "OPEN",
            positionId: "pos-1",
            leverage: "10",
            marginMode: "ISOLATION",
        },
        confirmAs: "place-order",
        displayed: {
            ...ACCOUNT,
            symbol: "BTCUSDT",
            side: "BUY",
            addQuantity: new Decimal("0.5"),
            entryPrice: new Decimal(50000),
            positionAmount: new Decimal(1),
            positionId: "pos-1",
            leverage: new Decimal(10),
            marginMode: "ISOLATION",
            availableMargin: new Decimal(5000),
            stepSize: new Decimal("0.0001"),
            accountStateAt: Date.now(),
        },
    };
}

describe("FEAT-0334 — the gate's add path", () => {
    it("approves a well-formed add", () => {
        const verdict = orderGate.verify(addIntent());

        expect(verdict.approved).toBe(true);
        expect(verdict.refusal).toBeNull();
    });

    it("verifies the size against the quantity the panel showed", () => {
        // The check an add can actually make: no risk formula, so the payload
        // must carry the number the trader agreed to and nothing else.
        const intent = addIntent();
        intent.payload.qty = "5";

        const verdict = orderGate.verify(intent);

        expect(verdict.approved).toBe(false);
        expect(verdict.refusal?.field).toBe("qty");
        expect(verdict.checked).toContain("qty");
    });

    it("refuses an add whose displayed quantity is missing", () => {
        // An unverifiable size is not a verified size — the same standard the
        // open path holds itself to when its risk inputs are absent.
        const intent = addIntent();
        delete intent.displayed.addQuantity;

        const verdict = orderGate.verify(intent);

        expect(verdict.approved).toBe(false);
        expect(verdict.refusal?.field).toBe("qty.inputs");
    });

    it("refuses a non-positive add", () => {
        const intent = addIntent();
        intent.payload.qty = "0";
        intent.displayed.addQuantity = new Decimal(0);

        const verdict = orderGate.verify(intent);

        expect(verdict.approved).toBe(false);
        expect(verdict.refusal?.field).toBe("qty");
    });

    it("refuses a quantity the venue could not fill", () => {
        // 0.55 with a step of 0.1 is not a whole multiple. Unlike a full
        // close there is no exemption here: nothing forces an add to be an
        // odd size.
        const intent = addIntent();
        intent.payload.qty = "0.55";
        intent.displayed.addQuantity = new Decimal("0.55");
        intent.displayed.stepSize = new Decimal("0.1");

        const verdict = orderGate.verify(intent);

        expect(verdict.approved).toBe(false);
        expect(verdict.refusal?.field).toBe("stepSize");
    });

    // --- the acceptance criterion this feature turns on ---------------------

    it("refuses an add that exceeds available margin", () => {
        // 2 BTC at 50 000 is 100 000 notional; at 10× that needs 10 000
        // margin, and only 5 000 is free.
        const intent = addIntent();
        intent.payload.qty = "2";
        intent.displayed.addQuantity = new Decimal(2);

        const verdict = orderGate.verify(intent);

        expect(verdict.approved).toBe(false);
        expect(verdict.refusal?.field).toBe("availableMargin");
        expect(verdict.refusal?.messageKey).toBe("orderGate.insufficientMargin");
        expect(verdict.checked).toContain("availableMargin");
    });

    it("approves an add that exactly consumes the available margin", () => {
        // 1 BTC at 50 000 over 10× is exactly 5 000 — fundable, so not
        // refused. An off-by-one here would refuse a legitimate max-size add.
        const intent = addIntent();
        intent.payload.qty = "1";
        intent.displayed.addQuantity = new Decimal(1);

        const verdict = orderGate.verify(intent);

        expect(verdict.approved).toBe(true);
    });

    it("treats an unknown leverage as no leverage rather than as free margin", () => {
        // Without leverage the whole notional has to be funded: 0.5 × 50 000
        // is 25 000 against 5 000 available. The conservative reading refuses;
        // dividing by an assumed leverage would have let it through.
        const intent = addIntent();
        delete intent.displayed.leverage;
        delete intent.payload.leverage;

        const verdict = orderGate.verify(intent);

        expect(verdict.approved).toBe(false);
        expect(verdict.refusal?.field).toBe("availableMargin");
    });

    it("skips the margin check when the balance has not loaded", () => {
        // Absent, not zero. Refusing every add on an account whose balance is
        // still in flight would be a broken control, and the venue remains the
        // authority on what it funds.
        const intent = addIntent();
        delete intent.displayed.availableMargin;

        const verdict = orderGate.verify(intent);

        expect(verdict.approved).toBe(true);
        expect(verdict.checked).not.toContain("availableMargin");
    });

    it("prices a market add off the previewed fill rather than skipping the check", () => {
        // A market add carries no limit price, so `displayed.entryPrice` — the
        // mark the panel previewed against — is what the margin costs.
        const intent = addIntent();
        intent.payload.orderType = "MARKET";
        delete intent.payload.price;
        intent.payload.qty = "3";
        intent.displayed.addQuantity = new Decimal(3);

        const verdict = orderGate.verify(intent);

        expect(verdict.approved).toBe(false);
        expect(verdict.refusal?.field).toBe("availableMargin");
    });

    // --- everything an open is held to, that an add is held to as well ------

    it("still enforces the instrument's volume limits", () => {
        const intent = addIntent();
        intent.displayed.maxLimitOrderVolume = new Decimal("0.1");

        const verdict = orderGate.verify(intent);

        expect(verdict.approved).toBe(false);
        expect(verdict.refusal?.field).toBe("maxLimitOrderVolume");
    });

    it("still enforces a stale account read, because an add opens exposure", () => {
        const intent = addIntent();
        intent.displayed.accountStateAt = Date.now() - MAX_ACCOUNT_STATE_AGE_MS - 1;

        const verdict = orderGate.verify(intent);

        expect(verdict.approved).toBe(false);
    });

    it("still compares the limit price against the one displayed", () => {
        const intent = addIntent();
        intent.payload.price = "49000";

        const verdict = orderGate.verify(intent);

        expect(verdict.approved).toBe(false);
        expect(verdict.refusal?.field).toBe("price");
    });

    it("still refuses a payload aimed at another symbol", () => {
        const intent = addIntent();
        intent.payload.symbol = "ETHUSDT";

        const verdict = orderGate.verify(intent);

        expect(verdict.approved).toBe(false);
        expect(verdict.refusal?.field).toBe("symbol");
    });

    it("still refuses a payload aimed at another position", () => {
        const intent = addIntent();
        intent.payload.positionId = "pos-2";

        const verdict = orderGate.verify(intent);

        expect(verdict.approved).toBe(false);
        expect(verdict.refusal?.field).toBe("positionId");
    });
});
