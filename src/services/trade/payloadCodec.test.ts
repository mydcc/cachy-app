/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";

import {
    completeIntent,
    parseOrderPayload,
    serializePayload,
    type AccountHalf,
    type PartialIntent,
} from "./payloadCodec";

const ACCOUNT: AccountHalf = {
    provider: "bitunix",
    accountFingerprint: "fp-1",
    accountId: "acc-1",
    paperMode: false,
};

function intent(overrides: Partial<PartialIntent> = {}): PartialIntent {
    return {
        kind: "cancel",
        endpoint: "/api/orders",
        payload: { orderId: "1" },
        displayed: {},
        ...overrides,
    } as PartialIntent;
}

describe("completeIntent", () => {
    it("fills the account fields from the supplied half", () => {
        const full = completeIntent(intent(), ACCOUNT);

        expect(full.displayed).toMatchObject({
            provider: "bitunix",
            accountFingerprint: "fp-1",
            accountId: "acc-1",
            paperMode: false,
        });
    });

    it("keeps the caller's order-specific fields", () => {
        const full = completeIntent(intent({ displayed: { symbol: "BTCUSDT" } }), ACCOUNT);

        expect(full.displayed.symbol).toBe("BTCUSDT");
        expect(full.kind).toBe("cancel");
    });

    it("refuses a caller that names a different account than the store", () => {
        // An account chip will eventually supply this. Until one does, a
        // mismatch means the caller and the store disagree about which
        // credentials the pass describes.
        expect(() =>
            completeIntent(intent({ displayed: { accountId: "acc-2" } }), ACCOUNT),
        ).toThrowError(/account \(mismatch\)/);

        try {
            completeIntent(intent({ displayed: { accountId: "acc-2" } }), ACCOUNT);
        } catch (e) {
            expect(e).toMatchObject({
                name: "OrderRefusedError",
                refusal: {
                    field: "account",
                    messageKey: "orderGate.mismatch",
                    values: { expected: "acc-2", actual: "acc-1" },
                },
            });
        }
    });

    it("lets a caller restate the account it agrees with", () => {
        const full = completeIntent(intent({ displayed: { accountId: "acc-1" } }), ACCOUNT);

        expect(full.displayed.accountId).toBe("acc-1");
    });

    // A blank id used to overwrite the store's real id with `undefined`,
    // and `assertGatePass` skips the comparison entirely when the pass
    // carries none — so an ordinary-looking assignment switched off a
    // money-critical check with nothing going red anywhere.
    it("never lets a blank supplied id replace the store's id", () => {
        const full = completeIntent(
            intent({ displayed: { accountId: undefined } }),
            ACCOUNT,
        );

        expect(full.displayed.accountId).toBe("acc-1");
    });

    it("keeps the store's id when no account exists", () => {
        const full = completeIntent(intent(), { ...ACCOUNT, accountId: undefined });

        expect(full.displayed.accountId).toBeUndefined();
    });
});

describe("parseOrderPayload", () => {
    const VALID = {
        exchange: "bitunix",
        type: "cancel-order",
        symbol: "BTCUSDT",
        orderId: "42",
    };

    it("accepts a payload the orders schema accepts", () => {
        expect(parseOrderPayload(VALID)).toMatchObject({ type: "cancel-order" });
    });

    // FEAT-0405 A5: the route rebuilds the signed bytes from *its* parse, so
    // signing the raw payload would be a different string. A silent fallback
    // would surface as a divergence in the middle of a trade.
    it("applies the schema's normalisation rather than passing the body through", () => {
        expect(parseOrderPayload({ ...VALID, side: undefined })).toMatchObject({
            marginCoin: "USDT",
        });
    });

    it("throws rather than signing a payload the route would refuse", () => {
        expect(() => parseOrderPayload({ exchange: "bitunix", type: "cancel-order" })).toThrow();
    });
});

describe("serializePayload", () => {
    it("renders Decimals as strings", () => {
        expect(serializePayload({ price: new Decimal("1.10") })).toEqual({ price: "1.1" });
    });

    it("walks nested objects and arrays", () => {
        const out = serializePayload({ legs: [{ price: new Decimal("2") }] });

        expect(out).toEqual({ legs: [{ price: "2" }] });
    });

    it("replaces a circular reference instead of overflowing the stack", () => {
        const cyclic: Record<string, unknown> = { name: "a" };
        cyclic.self = cyclic;

        expect(serializePayload(cyclic)).toEqual({ name: "a", self: "[Circular]" });
    });

    it("stops at the depth limit rather than recursing without bound", () => {
        let deep: unknown = "leaf";
        for (let i = 0; i < 30; i++) deep = { next: deep };

        expect(JSON.stringify(serializePayload(deep))).toContain("[Serialization Limit]");
    });

    it("passes primitives through unchanged", () => {
        expect(serializePayload(0)).toBe(0);
        expect(serializePayload("s")).toBe("s");
        expect(serializePayload(null)).toBeNull();
    });
});
