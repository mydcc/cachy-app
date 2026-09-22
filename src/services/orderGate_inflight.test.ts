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
 * BUG-0507 — the gate refuses a second identical intent while the first is
 * still in flight.
 *
 * `verify` is pure and safe to call twice, but `submit` sends: two
 * invocations are two attempts, and the venue mints two client IDs — two
 * full-risk positions, not a retry. The panel's own flag used to sit past
 * the confirmation dialog, so a second press during the dialog reached the
 * transport. These tests prove the refusal at the gate layer, with no
 * dialog involved: hold the first transport open, submit the same intent
 * again, and assert exactly one transport call.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Decimal } from "decimal.js";
import {
    orderGate,
    registerKillSwitch,
    registerRiskLimitCheck,
    OrderRefusedError,
    type OrderIntent,
} from "./orderGate";

const ACCOUNT = {
    provider: "bitunix",
    accountFingerprint: "abcd…wxyz",
    accountId: "bitunix-first",
};

/** Same shape as the baseline suite's opening order. */
function openIntent(): OrderIntent {
    return {
        kind: "open",
        endpoint: "/api/orders",
        payload: {
            type: "place-order",
            symbol: "BTCUSDT",
            side: "BUY",
            orderType: "LIMIT",
            qty: "0.02",
            price: "50000",
            slPrice: "49500",
            tpPrice: "51000",
            leverage: "10",
            marginMode: "ISOLATED",
        },
        displayed: {
            ...ACCOUNT,
            symbol: "BTCUSDT",
            side: "BUY",
            accountSize: new Decimal(1000),
            riskPercentage: new Decimal(1),
            entryPrice: new Decimal(50000),
            stopLossPrice: new Decimal(49500),
            takeProfits: [new Decimal(51000)],
            leverage: new Decimal(10),
            marginMode: "ISOLATED",
            stepSize: new Decimal("0.0001"),
            accountStateAt: Date.now(),
        },
    };
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

beforeEach(() => {
    registerKillSwitch(null);
    registerRiskLimitCheck(null);
});

afterEach(() => {
    registerKillSwitch(null);
    registerRiskLimitCheck(null);
});

describe("orderGate — in-flight duplicate guard (BUG-0507)", () => {
    it("refuses an identical intent while the first is still travelling", async () => {
        const first = deferred<string>();
        const transport = vi.fn((_pass: unknown) => first.promise);

        const pending = orderGate.submit(openIntent(), transport);
        // The first transport call is already recorded — submit registers
        // the fingerprint synchronously before its first await.
        expect(transport).toHaveBeenCalledTimes(1);

        await expect(orderGate.submit(openIntent(), transport)).rejects.toMatchObject({
            name: "OrderRefusedError",
            refusal: expect.objectContaining({
                reason: "duplicate",
                messageKey: "orderGate.duplicateInFlight",
            }),
        });
        expect(transport).toHaveBeenCalledTimes(1);

        first.resolve("filled");
        await expect(pending).resolves.toBe("filled");
    });

    it("a refused duplicate does not open the gate for a third identical submit", async () => {
        const first = deferred<string>();
        const transport = vi.fn((_pass: unknown) => first.promise);

        const pending = orderGate.submit(openIntent(), transport);
        expect(transport).toHaveBeenCalledTimes(1);

        // The duplicate is refused …
        await expect(orderGate.submit(openIntent(), transport)).rejects.toMatchObject({
            refusal: expect.objectContaining({ reason: "duplicate" }),
        });
        // … and the refusal must not have cleared the original flight's
        // guard: a third identical submit during the same flight is still
        // refused, and no second transport call happens.
        await expect(orderGate.submit(openIntent(), transport)).rejects.toMatchObject({
            refusal: expect.objectContaining({ reason: "duplicate" }),
        });
        expect(transport).toHaveBeenCalledTimes(1);

        first.resolve("filled");
        await expect(pending).resolves.toBe("filled");

        // Once the flight has landed, the same intent may go again.
        const retry = deferred<string>();
        const pendingRetry = orderGate.submit(openIntent(), (_pass: unknown) => retry.promise);
        retry.resolve("retried");
        await expect(pendingRetry).resolves.toBe("retried");
        expect(transport).toHaveBeenCalledTimes(1);
    });

    it("treats key order as irrelevant — same payload, rebuilt, still a duplicate", async () => {
        const first = deferred<string>();
        const transport = vi.fn((_pass: unknown) => first.promise);
        const pending = orderGate.submit(openIntent(), transport);

        // Same entries, shuffled insertion order.
        const rebuilt = openIntent();
        rebuilt.payload = {
            marginMode: "ISOLATED",
            leverage: "10",
            tpPrice: "51000",
            slPrice: "49500",
            price: "50000",
            qty: "0.02",
            orderType: "LIMIT",
            side: "BUY",
            symbol: "BTCUSDT",
            type: "place-order",
        };

        await expect(orderGate.submit(rebuilt, transport)).rejects.toMatchObject({
            refusal: expect.objectContaining({ reason: "duplicate" }),
        });
        expect(transport).toHaveBeenCalledTimes(1);

        first.resolve("filled");
        await expect(pending).resolves.toBe("filled");
    });

    it("lets a different quantity through — only identical payloads collide", async () => {
        const first = deferred<string>();
        const second = deferred<string>();
        const transport = vi.fn((_pass: unknown) => first.promise);
        const pendingFirst = orderGate.submit(openIntent(), transport);

        // Same button, deliberately different size: 1000 USDT at 2.5 % risk
        // over a 500 stop distance prices 0.05, so verification still
        // approves — and the payload differs, so the guard must not collide.
        const other = openIntent();
        other.payload = { ...other.payload, qty: "0.05" };
        other.displayed = { ...other.displayed, riskPercentage: new Decimal(2.5) };
        const pendingSecond = orderGate.submit(other, (_pass: unknown) => second.promise);

        first.resolve("first-filled");
        second.resolve("second-filled");
        await expect(pendingFirst).resolves.toBe("first-filled");
        await expect(pendingSecond).resolves.toBe("second-filled");
        expect(transport).toHaveBeenCalledTimes(1);
    });

    it("clears the guard when the flight ends, including on failure", async () => {
        const first = deferred<string>();
        const transport = vi.fn((_pass: unknown) => first.promise);
        const pending = orderGate.submit(openIntent(), transport);

        first.reject(new Error("venue down"));
        await expect(pending).rejects.toThrow("venue down");

        // The failed flight holds nothing back: the same intent may go again.
        const retry = deferred<string>();
        const pendingRetry = orderGate.submit(openIntent(), (_pass: unknown) => retry.promise);
        retry.resolve("retried");
        await expect(pendingRetry).resolves.toBe("retried");
        expect(transport).toHaveBeenCalledTimes(1);
    });

    it("refuses with a translatable message naming action and symbol", async () => {
        const first = deferred<string>();
        const transport = vi.fn((_pass: unknown) => first.promise);
        const pending = orderGate.submit(openIntent(), transport);

        const caught = await orderGate.submit(openIntent(), transport).catch((e) => e);
        expect(caught).toBeInstanceOf(OrderRefusedError);
        expect(caught.refusal.values).toMatchObject({ symbol: "BTCUSDT" });

        first.resolve("filled");
        await expect(pending).resolves.toBe("filled");
    });
});
