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

const appFetchMock = vi.hoisted(() => vi.fn());
vi.mock("../../lib/appAuth", () => ({
    appFetch: appFetchMock,
    appAuthHeaders: () => ({}),
}));

const loggerMock = vi.hoisted(() => ({
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
}));
vi.mock("../logger", () => ({
    logger: loggerMock,
}));

// `paperAccountFeed()` answers from the simulated book when paper mode is on
// (`paperState.enabled ? feed : null`). Hoisted so each test chooses: default
// `null` (live read path), a feed object for the paper-book path.
const paperAccountFeedMock = vi.hoisted(() => vi.fn());
vi.mock("../paperAccountFeed", () => ({
    paperAccountFeed: paperAccountFeedMock,
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
 *
 * Typed as `AccountSettingsPorts` with no cast: adding a 13th required port
 * to the interface fails compilation here until a default is added, which is
 * what keeps this builder load-bearing as the port-contract seam over time.
 */
function makePorts(overrides: Partial<AccountSettingsPorts> = {}): AccountSettingsPorts {
    const unexpected = (name: string) => () => {
        throw new Error(`port ${name} should not have been reached`);
    };
    const ports: AccountSettingsPorts = {
        activeVenue: () => "bitunix",
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
    };
    return ports;
}

/** A session-bound fetch that works: consultation is observable, travel succeeds. */
function workingSessionFetch(): AccountSettingsPorts["sessionFetch"] {
    return vi.fn(async () => new Response(JSON.stringify({ ok: true })));
}

/** Reset every mock handle this file owns (hoisted above). */
function resetMocks(): void {
    exchangeSignedFetchMock.mockReset();
    appFetchMock.mockReset();
    paperAccountFeedMock.mockReset();
    paperAccountFeedMock.mockReturnValue(null);
    loggerMock.log.mockReset();
    loggerMock.warn.mockReset();
    loggerMock.error.mockReset();
    loggerMock.debug.mockReset();
}

describe("accountSettings paper-mode refusal (FEAT-0068)", () => {
    beforeEach(() => {
        resetMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("refuses every write before the fetch port is consulted", async () => {
        // `sessionFetch` throws if reached, so a write that tried to travel
        // would surface as that error instead of the refusal — and the
        // explicit non-call assertion below names the property rather than
        // relying on the error text.
        const sessionFetch = vi.fn((): Promise<Response> => {
            throw new Error("port sessionFetch should not have been reached");
        });
        const service = createAccountSettingsService(
            makePorts({ isPaperMode: () => true, sessionFetch }),
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
        expect(sessionFetch).not.toHaveBeenCalled();
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

    it("still reads position mode in paper mode — via the simulated book", async () => {
        // `fetchPositionMode` takes the paper-book branch (not a paper
        // refusal): `paperExchange` simulates orders only, so there is no
        // live position mode to read — but the mode chip still needs a value.
        paperAccountFeedMock.mockReturnValue({
            accountInfo: () => ({ positionMode: "HEDGE" }),
        });
        const ports = makePorts({ isPaperMode: () => true });
        const service = createAccountSettingsService(ports);

        await service.fetchPositionMode();

        expect(ports.setPositionMode).toHaveBeenCalledWith("HEDGE");
        // No live read was taken for it.
        expect(exchangeSignedFetchMock).not.toHaveBeenCalled();
    });
});

describe("accountSettings unconfirmed-write warning (BUG-0409)", () => {
    beforeEach(() => {
        resetMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("warns when the venue never reports the written state, and stays silent when it does", async () => {
        // The write itself answers first, then the read-back keeps answering
        // with the pre-write value — the propagation window BUG-0409 captured.
        // The read payload carries the full venue shape (`symbol`,
        // `marginCoin`): without them the schema validation drops the read
        // before the predicate ever sees it, and the test would pin the stub
        // instead of the venue.
        exchangeSignedFetchMock.mockImplementation(async (req: { cachyPath: string }) => {
            if (req.cachyPath === "/api/leverage-margin-mode") {
                return okBody({
                    symbol: "BTCUSDT",
                    marginCoin: "USDT",
                    leverage: "10",
                    marginMode: "CROSS",
                });
            }
            return okBody({ code: "0", msg: "success" });
        });
        const sessionFetch = workingSessionFetch();
        const ports = makePorts({
            readRemoteMarginMode: () => "CROSS",
            sessionFetch,
        });
        const service = createAccountSettingsService(ports);

        await service.changeMarginMode("BTCUSDT", "CROSS");

        // The write travelled through the session-bound fetch (the positive
        // half of the refusal contract: reads *and* writes consult it).
        expect(sessionFetch).toHaveBeenCalledTimes(1);
        // The read leg is live: the venue's confirmation reached the display.
        expect(ports.applyRemoteLeverageMargin).toHaveBeenCalledWith(
            new Decimal(10),
            "CROSS",
        );
        // The venue confirmed the new margin mode, so there is nothing to warn
        // about — the warning exists to tell "the exchange is slow" apart from
        // "Cachy is broken", and firing it here would train the user to ignore it.
        expect(ports.warnUnconfirmed).not.toHaveBeenCalled();
    });

    it("warns once the read-back gives up, and routes through the port rather than a logger", async () => {
        // Every read-back answers with the value the trader was already seeing.
        exchangeSignedFetchMock.mockImplementation(async (req: { cachyPath: string }) => {
            if (req.cachyPath === "/api/leverage-margin-mode") {
                return okBody({
                    symbol: "BTCUSDT",
                    marginCoin: "USDT",
                    leverage: "10",
                    marginMode: "ISOLATION",
                });
            }
            return okBody({ code: "0", msg: "success" });
        });
        const warnUnconfirmed = vi.fn();
        const sessionFetch = workingSessionFetch();
        const ports = makePorts({
            warnUnconfirmed,
            readRemoteMarginMode: () => "ISOLATION",
            sessionFetch,
        });
        const service = createAccountSettingsService(ports);

        // The delays are trader-noticeable by design (`READ_BACK_DELAYS_MS`),
        // so real timers would cost ~2.7s of wall-clock per run: advance fake
        // time until the warning fires, then let the call settle.
        vi.useFakeTimers();
        try {
            const pending = service.changeMarginMode("BTCUSDT", "CROSS");
            for (let round = 0; round < 10 && warnUnconfirmed.mock.calls.length === 0; round++) {
                await vi.advanceTimersByTimeAsync(10_000);
            }
            await pending;
        } finally {
            vi.useRealTimers();
        }

        expect(sessionFetch).toHaveBeenCalledTimes(1);
        // The read leg is live (stale, but live): the warning answers a real
        // venue value, not a dead read.
        expect(ports.applyRemoteLeverageMargin).toHaveBeenCalledWith(
            new Decimal(10),
            "ISOLATION",
        );
        expect(warnUnconfirmed).toHaveBeenCalledTimes(1);
        // The displayed value stays whatever the venue last reported rather
        // than the requested one — the optimistic write FEAT-0068 rules out.
        expect(ports.applyRemoteLeverageMargin).not.toHaveBeenCalledWith(
            expect.anything(),
            "CROSS",
        );
        // The warn path is quiet: no log line competes with the user-visible
        // warning (which exists precisely so "slow exchange" and "broken
        // app" stay distinguishable).
        expect(loggerMock.debug).not.toHaveBeenCalled();
        expect(loggerMock.warn).not.toHaveBeenCalled();
        expect(loggerMock.error).not.toHaveBeenCalled();
    });

    it("warns when a position-mode write is never confirmed", async () => {
        // The second warn site (`changePositionMode`): the read-back runs
        // `fetchPositionMode`, whose paper-book branch answers from the
        // simulated account. It keeps answering the pre-write mode.
        paperAccountFeedMock.mockReturnValue({
            accountInfo: () => ({ positionMode: "HEDGE" }),
        });
        exchangeSignedFetchMock.mockResolvedValue(okBody({ code: "0", msg: "success" }));
        const warnUnconfirmed = vi.fn();
        const setPositionMode = vi.fn();
        const sessionFetch = workingSessionFetch();
        const ports = makePorts({
            warnUnconfirmed,
            setPositionMode,
            readPositionMode: () => "HEDGE",
            sessionFetch,
        });
        const service = createAccountSettingsService(ports);

        vi.useFakeTimers();
        try {
            const pending = service.changePositionMode("ONE_WAY");
            for (let round = 0; round < 10 && warnUnconfirmed.mock.calls.length === 0; round++) {
                await vi.advanceTimersByTimeAsync(10_000);
            }
            await pending;
        } finally {
            vi.useRealTimers();
        }

        expect(sessionFetch).toHaveBeenCalledTimes(1);
        // The read leg ran (the book was consulted on every attempt)…
        expect(setPositionMode).toHaveBeenCalledWith("HEDGE");
        // …never confirmed the write, and said so exactly once.
        expect(warnUnconfirmed).toHaveBeenCalledTimes(1);
        expect(loggerMock.debug).not.toHaveBeenCalled();
        expect(loggerMock.warn).not.toHaveBeenCalled();
        expect(loggerMock.error).not.toHaveBeenCalled();
    });
});