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

/**
 * FEAT-0253 — what happens between the network and the store.
 *
 * The arithmetic is covered in `src/lib/fees/`. What is only testable here is
 * the failure behaviour, and it is deliberately not symmetric:
 *
 * - a *successful* response saying "no usable fills" must clear the rates, so
 *   nothing stale is presented as this account's;
 * - a *failed* request must leave them alone, because a dropped connection is
 *   not evidence that a rate the broker really charged has stopped being true.
 *
 * Getting those two the wrong way round would either invent a broker rate or
 * throw a real one away, and both break the provenance guarantee.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Decimal } from "decimal.js";

const appFetchMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/appAuth", () => ({ appFetch: appFetchMock }));

const keysMock = vi.hoisted(() => ({
    key: "test-key-value" as string | undefined,
    secret: "test-secret-value" as string | undefined,
}));
vi.mock("../stores/settings/accounts", () => ({
    keysForExchange: () => keysMock,
}));
vi.mock("../stores/settings.svelte", () => ({ settingsState: { accounts: {} } }));

const tradeStateMock = vi.hoisted(() => ({
    remoteMakerFee: undefined as Decimal | undefined,
    remoteTakerFee: undefined as Decimal | undefined,
    remoteFeeSamples: {} as { maker?: number; taker?: number },
    remoteFeeExchange: undefined as string | undefined,
}));
vi.mock("../stores/trade.svelte", () => ({ tradeState: tradeStateMock }));

import { refreshDerivedFeeRates } from "./feeRateService";

/** A fill charged exactly `ratePercent` on a notional of 100 × 2. */
function fillAt(role: "MAKER" | "TAKER", ratePercent: string) {
    const fee = new Decimal(200).times(new Decimal(ratePercent).div(100));
    return { roleType: role, price: "100", qty: "2", fee: fee.toString() };
}

function respondWith(body: unknown, ok = true) {
    appFetchMock.mockResolvedValue({ ok, json: async () => body });
}

/** Pre-load the store as though an earlier sync had derived rates. */
function seedExistingRates() {
    tradeStateMock.remoteMakerFee = new Decimal("0.011");
    tradeStateMock.remoteTakerFee = new Decimal("0.033");
    tradeStateMock.remoteFeeSamples = { maker: 2, taker: 3 };
    tradeStateMock.remoteFeeExchange = "bitunix";
}

beforeEach(() => {
    vi.clearAllMocks();
    keysMock.key = "test-key-value";
    keysMock.secret = "test-secret-value";
    tradeStateMock.remoteMakerFee = undefined;
    tradeStateMock.remoteTakerFee = undefined;
    tradeStateMock.remoteFeeSamples = {};
    tradeStateMock.remoteFeeExchange = undefined;
});

describe("refreshDerivedFeeRates — the happy path", () => {
    it("derives both rates from the fills and records the venue they came from", async () => {
        respondWith({ data: [fillAt("MAKER", "0.02"), fillAt("TAKER", "0.06")] });

        const rates = await refreshDerivedFeeRates();

        expect(rates?.maker?.rate.toString()).toBe("0.02");
        expect(tradeStateMock.remoteMakerFee?.toString()).toBe("0.02");
        expect(tradeStateMock.remoteTakerFee?.toString()).toBe("0.06");
        expect(tradeStateMock.remoteFeeSamples).toEqual({ maker: 1, taker: 1 });
        // Without the venue tag the UI cannot tell whether these rates describe
        // the exchange currently selected.
        expect(tradeStateMock.remoteFeeExchange).toBe("bitunix");
    });

    it("leaves a role with no fills undefined rather than zero", async () => {
        respondWith({ data: [fillAt("TAKER", "0.06")] });

        await refreshDerivedFeeRates();

        expect(tradeStateMock.remoteTakerFee?.toString()).toBe("0.06");
        expect(tradeStateMock.remoteMakerFee).toBeUndefined();
    });

    it("sends the credentials as headers and bounds the request", async () => {
        respondWith({ data: [fillAt("TAKER", "0.06")] });

        await refreshDerivedFeeRates();

        const [url, init] = appFetchMock.mock.calls[0];
        expect(url).toBe("/api/sync");
        expect(init.method).toBe("POST");
        expect(init.headers["X-Api-Key"]).toBe("test-key-value");
        // The journal sync holds its lock across this call, so it must not be
        // able to hang there indefinitely.
        expect(init.signal).toBeDefined();
    });
});

describe("refreshDerivedFeeRates — no rate could be established", () => {
    it("clears the rates when no API keys are configured", async () => {
        seedExistingRates();
        keysMock.key = undefined;

        expect(await refreshDerivedFeeRates()).toBeNull();
        expect(appFetchMock).not.toHaveBeenCalled();
        expect(tradeStateMock.remoteMakerFee).toBeUndefined();
        expect(tradeStateMock.remoteFeeExchange).toBeUndefined();
    });

    it("clears the rates when the account has no usable fills", async () => {
        seedExistingRates();
        respondWith({ data: [] });

        expect(await refreshDerivedFeeRates()).toBeNull();
        // A successful "you have no fills" is real information: the previous
        // derivation must not survive it wearing a "from broker" badge.
        expect(tradeStateMock.remoteTakerFee).toBeUndefined();
        expect(tradeStateMock.remoteFeeExchange).toBeUndefined();
    });

    it("clears the rates when every fill is unusable", async () => {
        seedExistingRates();
        respondWith({
            data: [{ roleType: "SETTLEMENT", price: "1", qty: "1", fee: "1" }],
        });

        expect(await refreshDerivedFeeRates()).toBeNull();
        expect(tradeStateMock.remoteTakerFee).toBeUndefined();
    });
});

describe("refreshDerivedFeeRates — transport failures keep what was true", () => {
    it("keeps the last known rates when the request throws", async () => {
        seedExistingRates();
        appFetchMock.mockRejectedValue(new Error("network down"));

        expect(await refreshDerivedFeeRates()).toBeNull();
        // Downgrading a real broker rate to an assumption over a dropped
        // connection would misreport where the number came from.
        expect(tradeStateMock.remoteTakerFee?.toString()).toBe("0.033");
        expect(tradeStateMock.remoteFeeExchange).toBe("bitunix");
    });

    it("keeps the last known rates on a non-OK response", async () => {
        seedExistingRates();
        respondWith({ error: "unauthorized" }, false);

        expect(await refreshDerivedFeeRates()).toBeNull();
        expect(tradeStateMock.remoteTakerFee?.toString()).toBe("0.033");
    });

    it("keeps the last known rates when the payload carries an error", async () => {
        seedExistingRates();
        respondWith({ error: "Bitunix API error code: 10003" });

        expect(await refreshDerivedFeeRates()).toBeNull();
        expect(tradeStateMock.remoteTakerFee?.toString()).toBe("0.033");
    });

    it("keeps the last known rates when the payload shape is unexpected", async () => {
        seedExistingRates();
        respondWith({ data: "not-an-array" });

        expect(await refreshDerivedFeeRates()).toBeNull();
        expect(tradeStateMock.remoteTakerFee?.toString()).toBe("0.033");
    });

    it("never throws out of the sync it runs inside", async () => {
        appFetchMock.mockRejectedValue(new Error("boom"));
        await expect(refreshDerivedFeeRates()).resolves.toBeNull();
    });
});
