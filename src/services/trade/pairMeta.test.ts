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

import { createPairMetaLoader, type PairMetaSink } from "./pairMeta";

const BITUNIX_ROW = {
    code: 0,
    data: [
        {
            symbol: "BTCUSDT",
            basePrecision: 8,
            quotePrecision: 2,
            minLeverage: 1,
            maxLeverage: 100,
            defaultLeverage: 10,
            symbolStatus: "OPEN",
            isApiSupported: true,
        },
    ],
};

const BITGET_ROWS = {
    code: "00000",
    data: [
        {
            symbol: "BTCUSDT",
            volumePlace: "3",
            pricePlace: "1",
            minTradeNum: "0.001",
            minLever: "1",
            maxLever: "75",
            // V2 says "normal"; the gate and the panel speak Bitunix.
            symbolStatus: "normal",
        },
    ],
};

function jsonResponse(body: unknown, ok = true) {
    return Promise.resolve({
        ok,
        json: () => Promise.resolve(body),
    } as Response);
}

function makeSink(overrides: Partial<PairMetaSink> = {}) {
    const sink = {
        shouldFetchMeta: vi.fn(() => true),
        noteMetaFetch: vi.fn(),
        setSymbolMeta: vi.fn(),
        ...overrides,
    };
    return sink;
}

describe("createPairMetaLoader", () => {
    beforeEach(() => appFetch.mockReset());

    it("loads the Bitunix pair row and publishes it under the normalised key", async () => {
        appFetch.mockImplementation(() => jsonResponse(BITUNIX_ROW));
        const sink = makeSink();

        await createPairMetaLoader(sink).fetchTradingPairInfo("btcusdt", "bitunix");

        expect(appFetch.mock.calls[0]?.[0]).toContain("/api/trading-pairs");
        expect(sink.setSymbolMeta).toHaveBeenCalledWith(
            "BTCUSDT",
            expect.objectContaining({ basePrecision: 8, maxLeverage: 100 }),
        );
        expect(sink.noteMetaFetch).toHaveBeenCalledWith("BTCUSDT", true);
    });

    it("maps Bitget V2 'normal' onto the Bitunix vocabulary", async () => {
        appFetch.mockImplementation(() => jsonResponse(BITGET_ROWS));
        const sink = makeSink();

        await createPairMetaLoader(sink).fetchTradingPairInfo("BTCUSDT_UMCBL", "bitget");

        expect(appFetch.mock.calls[0]?.[0]).toContain("/api/bitget/contracts");
        expect(sink.setSymbolMeta).toHaveBeenCalledWith(
            "BTCUSDT",
            expect.objectContaining({ symbolStatus: "OPEN", quotePrecision: 1, maxLeverage: 75 }),
        );
    });

    // The one piece of mutable state this module owns: concurrent callers for
    // the same symbol share a request instead of each hitting the venue.
    it("coalesces concurrent loads of the same symbol into one request", async () => {
        appFetch.mockImplementation(() => jsonResponse(BITUNIX_ROW));
        const sink = makeSink();
        const loader = createPairMetaLoader(sink);

        await Promise.all([
            loader.fetchTradingPairInfo("BTCUSDT", "bitunix"),
            loader.fetchTradingPairInfo("BTCUSDT", "bitunix"),
            loader.fetchTradingPairInfo("BTCUSDT", "bitunix"),
        ]);

        expect(appFetch).toHaveBeenCalledTimes(1);
        expect(sink.setSymbolMeta).toHaveBeenCalledTimes(1);
    });

    it("keeps symbols independent of each other", async () => {
        appFetch.mockImplementation(() => jsonResponse(BITUNIX_ROW));
        const sink = makeSink();
        const loader = createPairMetaLoader(sink);

        await Promise.all([
            loader.fetchTradingPairInfo("BTCUSDT", "bitunix"),
            loader.fetchTradingPairInfo("ETHUSDT", "bitunix"),
        ]);

        expect(appFetch).toHaveBeenCalledTimes(2);
    });

    it("does not request a symbol the market store is still cooling down on", async () => {
        appFetch.mockImplementation(() => jsonResponse(BITUNIX_ROW));
        const sink = makeSink({ shouldFetchMeta: vi.fn(() => false) });

        await createPairMetaLoader(sink).fetchTradingPairInfo("BTCUSDT", "bitunix");

        expect(appFetch).not.toHaveBeenCalled();
        expect(sink.setSymbolMeta).not.toHaveBeenCalled();
    });

    // Every miss path records the attempt instead of writing a stub: a failed
    // fetch must retry after the cooldown, never read as "no precision".
    it("records a failed attempt and writes nothing when the venue says no", async () => {
        appFetch.mockImplementation(() => jsonResponse({}, false));
        const sink = makeSink();

        await createPairMetaLoader(sink).fetchTradingPairInfo("BTCUSDT", "bitunix");

        expect(sink.noteMetaFetch).toHaveBeenCalledWith("BTCUSDT", false);
        expect(sink.setSymbolMeta).not.toHaveBeenCalled();
    });

    it("records a failed attempt when the body does not validate", async () => {
        appFetch.mockImplementation(() => jsonResponse({ code: 0, data: "nope" }));
        const sink = makeSink();

        await createPairMetaLoader(sink).fetchTradingPairInfo("BTCUSDT", "bitunix");

        expect(sink.noteMetaFetch).toHaveBeenCalledWith("BTCUSDT", false);
        expect(sink.setSymbolMeta).not.toHaveBeenCalled();
    });

    // A transport that throws and one that answers "no" take different arms
    // of the same try, so both are worth pinning. The throw is raised by the
    // response's `ok` getter rather than by the mock itself: Vitest attributes
    // an error thrown inside a `vi.fn` implementation to the test even when
    // the code under test catches it.
    const throwingFetch = () =>
        Promise.resolve({
            get ok(): boolean {
                throw new Error("offline");
            },
            json: () => Promise.resolve({}),
        } as unknown as Response);

    it("records a failed attempt when the transport throws", async () => {
        appFetch.mockImplementation(throwingFetch);
        const sink = makeSink();

        await createPairMetaLoader(sink).fetchTradingPairInfo("BTCUSDT", "bitunix");

        expect(sink.noteMetaFetch).toHaveBeenCalledWith("BTCUSDT", false);
        expect(sink.setSymbolMeta).not.toHaveBeenCalled();
    });

    // A failed flight that stayed in the map would block every retry until
    // the process restarts.
    it("releases the in-flight entry after a failure so a later call retries", async () => {
        appFetch.mockImplementation(throwingFetch);
        const sink = makeSink();
        const loader = createPairMetaLoader(sink);

        await loader.fetchTradingPairInfo("BTCUSDT", "bitunix");
        appFetch.mockImplementation(() => jsonResponse(BITUNIX_ROW));
        await loader.fetchTradingPairInfo("BTCUSDT", "bitunix");

        expect(appFetch).toHaveBeenCalledTimes(2);
        expect(sink.setSymbolMeta).toHaveBeenCalledTimes(1);
    });
});
