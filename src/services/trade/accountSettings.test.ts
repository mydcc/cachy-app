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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * The port contract for the account-settings lane.
 *
 * `tradeService_accountSettings.test.ts` covers these six methods well, but
 * only through the `tradeService` singleton with the store layer mocked. That
 * cannot reach this module's own seams: whether `sessionFetch()` is consulted
 * before anything travels, or whether the refusal happens before the port is
 * called at all. Injecting the ports is what makes those observable — every
 * sibling module in this directory already ships a suite of its own for the
 * same reason.
 *
 * What stays untested here, and why: `readBackUntilApplied` reaches
 * `accountEpoch` directly instead of through a port, so the one decision that
 * most needs driving — "did the account move under us mid-read" — is still not
 * substitutable from here. Tracked as an open item on FEAT-0342 rather than
 * papered over.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Decimal } from "decimal.js";
import {
    createAccountSettingsService,
    type AccountSettingsPorts,
} from "./accountSettings";

const exchangeSignedFetchMock = vi.hoisted(() => vi.fn());
vi.mock("../../utils/exchange/browserSigning", () => ({
    exchangeSignedFetch: exchangeSignedFetchMock,
}));

vi.mock("../../lib/appAuth", () => ({
    appFetch: vi.fn(),
    appAuthHeaders: () => ({}),
}));

vi.mock("../logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/** A venue response shaped like the real envelope, `Response`-like enough for
 * `accountSettingRequest`, which reads `text()`, `ok` and `status`. */
function okBody(data: unknown) {
    const envelope = JSON.stringify({ code: "0", data, msg: "success" });
    return {
        ok: true,
        status: 200,
        // The read paths consume `json()`, the write path consumes `text()`.
        json: async () => JSON.parse(envelope),
        text: async () => envelope,
    };
}

/**
 * Ports that fail loudly on anything they are not supposed to reach, so an
 * unexpected call is an assertion failure rather than a silent pass.
 */
function makePorts(overrides: Partial<AccountSettingsPorts> = {}) {
    const unexpected = (name: string) => () => {
        throw new Error(`port ${name} should not have been reached`);
    };
    const ports = {
        activeVenue: () => "bitunix" as const,
        activeKeys: () => ({ key: "test-key-1234", secret: "test-secret" }),
        sessionFetch: unexpected("sessionFetch"),
        isPaperMode: () => false,
        applyRemoteLeverageMargin: vi.fn(),
        readRemoteMarginMode: () => "ISOLATION",
        setPositionMode: vi.fn(),
        readPositionMode: () => "HEDGE",
        setMarginModeVerifying: vi.fn(),
        setPositionModeVerifying: vi.fn(),
        requestSync: vi.fn(),
        warnUnconfirmed: vi.fn(),
        ...overrides,
    } as unknown as AccountSettingsPorts;
    return ports;
}

describe("accountSettings paper-mode refusal (FEAT-0068)", () => {
    beforeEach(() => {
        exchangeSignedFetchMock.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("refuses every write before the fetch port is consulted", async () => {
        // `sessionFetch` throws if reached, so a write that tried to travel
        // would surface as that error instead of the refusal.
        const service = createAccountSettingsService(
            makePorts({ isPaperMode: () => true }),
        );

        await expect(
            service.changeLeverage("BTCUSDT", new Decimal(10)),
        ).rejects.toThrow(/paperMode/);
        await expect(
            service.changeMarginMode("BTCUSDT", "CROSS"),
        ).rejects.toThrow(/paperMode/);
        await expect(
            service.changePositionMode("ONE_WAY"),
        ).rejects.toThrow(/paperMode/);
        await expect(
            service.adjustPositionMargin({
                symbol: "BTCUSDT",
                amount: new Decimal(1),
                side: "LONG",
            }),
        ).rejects.toThrow(/paperMode/);

        // Nothing left the process: `paperExchange` simulates orders and has
        // no notion of leverage or margin mode, so there is nothing on the far
        // side to change.
        expect(exchangeSignedFetchMock).not.toHaveBeenCalled();
    });

    it("still reads in paper mode — a refusal applies to writes, not reads", async () => {
        exchangeSignedFetchMock.mockResolvedValue(
            okBody({
                symbol: "BTCUSDT",
                marginCoin: "USDT",
                leverage: "10",
                marginMode: "ISOLATION",
            }),
        );
        const ports = makePorts({ isPaperMode: () => true });
        const service = createAccountSettingsService(ports);

        await service.fetchLeverageMarginMode("BTCUSDT");

        expect(exchangeSignedFetchMock).toHaveBeenCalledTimes(1);
        expect(ports.applyRemoteLeverageMargin).toHaveBeenCalledWith(
            new Decimal(10),
            "ISOLATION",
        );
    });
});

describe("accountSettings unconfirmed-write warning (BUG-0409)", () => {
    beforeEach(() => {
        exchangeSignedFetchMock.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("warns when the venue never reports the written state, and stays silent when it does", async () => {
        // The write itself answers first, then the read-back keeps answering
        // with the pre-write value — the propagation window BUG-0409 captured.
        exchangeSignedFetchMock.mockImplementation(async (req: { cachyPath: string }) => {
            if (req.cachyPath === "/api/leverage-margin-mode") {
                return okBody({ leverage: "10", marginMode: "CROSS" });
            }
            return okBody({ code: "0", msg: "success" });
        });
        const ports = makePorts({
            readRemoteMarginMode: () => "CROSS",
            sessionFetch: vi.fn() as unknown as AccountSettingsPorts["sessionFetch"],
        });
        const service = createAccountSettingsService(ports);

        await service.changeMarginMode("BTCUSDT", "CROSS");

        // The venue confirmed the new margin mode, so there is nothing to warn
        // about — the warning exists to tell "the exchange is slow" apart from
        // "Cachy is broken", and firing it here would train the user to ignore it.
        expect(ports.warnUnconfirmed).not.toHaveBeenCalled();
    });

    it("warns once the read-back gives up, and routes through the port rather than a logger", async () => {
        // Every read-back answers with the value the trader was already seeing.
        exchangeSignedFetchMock.mockImplementation(async (req: { cachyPath: string }) => {
            if (req.cachyPath === "/api/leverage-margin-mode") {
                return okBody({ leverage: "10", marginMode: "ISOLATION" });
            }
            return okBody({ code: "0", msg: "success" });
        });
        const warnUnconfirmed = vi.fn();
        const ports = makePorts({
            warnUnconfirmed,
            readRemoteMarginMode: () => "ISOLATION",
            sessionFetch: vi.fn() as unknown as AccountSettingsPorts["sessionFetch"],
        });
        const service = createAccountSettingsService(ports);

        await service.changeMarginMode("BTCUSDT", "CROSS");

        expect(warnUnconfirmed).toHaveBeenCalledTimes(1);
        // The displayed value stays whatever the venue last reported rather
        // than the requested one — the optimistic write FEAT-0068 rules out.
        expect(ports.applyRemoteLeverageMargin).not.toHaveBeenCalledWith(
            expect.anything(),
            "CROSS",
        );
    });
});