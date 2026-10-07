/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const appFetch = vi.hoisted(() => vi.fn());
vi.mock("../../lib/appAuth", () => ({ appFetch }));

import { createSessionDispatch, type DispatchContext } from "./dispatchSession";

const LIVE_BITUNIX: DispatchContext = {
    provider: "bitunix",
    accountId: "acc-1",
    accountFingerprint: "fp-1",
    paperMode: false,
};

/**
 * The session token is opaque to this module, so a stand-in is enough: what
 * the rule reads is the boolean `isCurrentSession` returns.
 */
const SESSION = { token: "session-1" } as never;

/**
 * `appFetch`'s third argument is the per-attempt hook the guard rides — the
 * check has to run on every attempt, including the 401 retry that reaches the
 * venue. A fake that ignores the hook would make every refusal test pass for
 * the wrong reason. `async` so a guard refusal becomes a rejected promise,
 * as the real `appFetch` does, rather than a synchronous throw.
 */
const respond = async (input: string, init?: RequestInit, beforeAttempt?: () => void) => {
    beforeAttempt?.();
    return new Response("ok");
};

const refusal = (run: () => Promise<unknown>) =>
    run().then(
        () => {
            throw new Error("expected a refusal, but the request went out");
        },
        (e: unknown) => e,
    );

describe("createSessionDispatch", () => {
    beforeEach(() => {
        appFetch.mockReset();
        appFetch.mockImplementation(respond);
    });

    it("dispatches when the session is current and the context is unchanged", async () => {
        const dispatch = createSessionDispatch(() => LIVE_BITUNIX, () => true);

        const response = await dispatch(SESSION, LIVE_BITUNIX)("/api/orders");

        expect(response.status).toBe(200);
        expect(appFetch).toHaveBeenCalledTimes(1);
    });

    // BUG-0551: a switch during the signing await used to reach the venue.
    // The two layers below cover the two ways a context can move.
    it("refuses when the context moved, naming the field that changed", async () => {
        const dispatch = createSessionDispatch(
            () => ({ ...LIVE_BITUNIX, accountId: "acc-2" }),
            () => true,
        );

        const error = await refusal(() =>
            dispatch(SESSION, LIVE_BITUNIX)("/api/orders"),
        );

        expect(error).toMatchObject({
            name: "OrderRefusedError",
            refusal: { field: "account", messageKey: "orderGate.sessionChanged" },
        });
    });

    it("names a venue switch as the exchange, not the account", async () => {
        const dispatch = createSessionDispatch(
            () => ({ ...LIVE_BITUNIX, provider: "bitget" }),
            () => true,
        );

        const error = await refusal(() =>
            dispatch(SESSION, LIVE_BITUNIX)("/api/orders"),
        );

        expect(error).toMatchObject({
            refusal: { field: "exchange", messageKey: "orderGate.sessionChanged" },
        });
    });

    it("names a live-to-paper flip as the mode", async () => {
        const dispatch = createSessionDispatch(
            () => ({ ...LIVE_BITUNIX, paperMode: true }),
            () => true,
        );

        const error = await refusal(() =>
            dispatch(SESSION, LIVE_BITUNIX)("/api/orders"),
        );

        expect(error).toMatchObject({
            refusal: { field: "mode", messageKey: "orderGate.sessionChanged" },
        });
    });

    it("refuses a rotated session whose context fields read the same", async () => {
        // Switch away and back, or re-enter credentials: nothing in the
        // context changed, so only the session token can catch it — and it
        // gets its own message, because there is no field to name.
        const dispatch = createSessionDispatch(() => LIVE_BITUNIX, () => false);

        const error = await refusal(() =>
            dispatch(SESSION, LIVE_BITUNIX)("/api/orders"),
        );

        expect(error).toMatchObject({
            refusal: { field: "session", messageKey: "orderGate.sessionRotated" },
        });
    });

    it("re-reads the context per attempt rather than once per wrapper", async () => {
        // The check rides appFetch's per-attempt hook because signing is not
        // the last await: a 401 retry is the attempt that reaches the venue.
        let current = LIVE_BITUNIX;
        const dispatch = createSessionDispatch(() => current, () => true);
        const guarded = dispatch(SESSION, LIVE_BITUNIX);

        current = { ...LIVE_BITUNIX, accountFingerprint: "fp-2" };

        const error = await refusal(() => guarded("/api/orders"));

        expect(error).toMatchObject({
            refusal: { messageKey: "orderGate.sessionChanged" },
        });
    });

    it("runs the check on every attempt, not only the first", async () => {
        const hook = vi.fn();
        appFetch.mockImplementation(
            async (input: string, init?: RequestInit, beforeAttempt?: () => void) => {
                hook();
                beforeAttempt?.();
                return new Response("ok");
            },
        );
        const dispatch = createSessionDispatch(() => LIVE_BITUNIX, () => true);

        await dispatch(SESSION, LIVE_BITUNIX)("/api/orders");

        expect(hook).toHaveBeenCalledTimes(1);
        expect(appFetch.mock.calls[0]?.[2]).toBeTypeOf("function");
    });
});

