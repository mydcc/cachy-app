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
 * The position lifecycle lane, driven through its ports.
 *
 * These were private methods on `TradeService`, so each of the decisions below
 * could only be reached by arranging the whole singleton — venue mocks, gate
 * state, the paper store — and none of them could be asserted on its own.
 * The invariants here are the ones the extraction makes cheap to pin, and each
 * was previously untested in any form:
 *
 *   - a read whose ticket was superseded must not write the snapshot
 *   - a failed verification read is "unverified", never "flat"
 *   - ghost eviction may only touch keys this lane mirrored
 *   - the 200 ms staleness rule decides *whether* to refresh, and the provider
 *     decides only *how*
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
    createPositionLifecycleService,
    type PositionLifecyclePorts,
} from "./positionLifecycle";

const exchangeSignedFetchMock = vi.hoisted(() => vi.fn());
vi.mock("../../utils/exchange/browserSigning", async (importOriginal) => {
    const actual =
        await importOriginal<typeof import("../../utils/exchange/browserSigning")>();
    return { ...actual, exchangeSignedFetch: exchangeSignedFetchMock };
});

vi.mock("../../lib/appAuth", () => ({
    appFetch: vi.fn(),
    appAuthHeaders: () => ({}),
}));

vi.mock("../logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/** One position as the venue reports it. */
function venuePosition(over: Record<string, unknown> = {}) {
    return {
        symbol: "BTCUSDT",
        side: "LONG",
        size: "1",
        entryPrice: "100",
        unrealizedPnL: "0",
        leverage: "10",
        marginMode: "ISOLATED",
        liquidationPrice: "0",
        margin: "10",
        markPrice: "100",
        ...over,
    };
}

function positionsResponse(positions: unknown[]) {
    const envelope = JSON.stringify({
        code: "0",
        data: { positions },
        msg: "success",
    });
    return {
        ok: true,
        status: 200,
        json: async () => JSON.parse(envelope),
        text: async () => envelope,
    };
}

/** A port that fails loudly if it is reached at all. */
function unexpected(name: string) {
    return () => {
        throw new Error(`port ${name} should not have been reached`);
    };
}

/** Ports that fail loudly on anything not meant to be reached. */
function makePorts(overrides: Partial<PositionLifecyclePorts> = {}) {
    return {
        activeProvider: () => "bitget",
        activeKeys: () => ({ key: "test-key-1234", secret: "test-secret" }),
        getPositions: () => [],
        updatePosition: vi.fn(),
        removePosition: vi.fn(),
        paperFeed: () => null,
        hydratePositions: vi.fn(),
        beginPositionsRead: () => "ticket-1",
        mayApplyPositionsRead: () => true,
        ...overrides,
    } as unknown as PositionLifecyclePorts;
}

describe("positionLifecycle read ticket (BUG-0587)", () => {
    beforeEach(() => {
        exchangeSignedFetchMock.mockReset();
    });

    it("still returns the list when its ticket was superseded, but writes nothing", async () => {
        // The hydration is gated; the verification is not. A stale response
        // must still be able to fail the caller's check — otherwise a read
        // that lost the race would silently verify as flat.
        exchangeSignedFetchMock.mockResolvedValue(
            positionsResponse([venuePosition()]),
        );
        const ports = makePorts({ mayApplyPositionsRead: () => false });
        const service = createPositionLifecycleService(ports);

        const result = await service.readFreshPositions("bitget");

        expect(result).toHaveLength(1);
        expect(ports.hydratePositions).not.toHaveBeenCalled();
    });

    it("hydrates and mirrors when the ticket still holds", async () => {
        exchangeSignedFetchMock.mockResolvedValue(
            positionsResponse([venuePosition()]),
        );
        const ports = makePorts();
        const service = createPositionLifecycleService(ports);

        await service.readFreshPositions("bitget");

        expect(ports.hydratePositions).toHaveBeenCalledTimes(1);
        // Non-Bitunix only: see the mirror's doc comment for why.
        expect(ports.updatePosition).toHaveBeenCalledTimes(1);
    });

    it("never mirrors onto Bitunix, whose WS feed owns real positionIds", async () => {
        exchangeSignedFetchMock.mockResolvedValue(
            positionsResponse([venuePosition()]),
        );
        const ports = makePorts({ activeProvider: () => "bitunix" });
        const service = createPositionLifecycleService(ports);

        await service.readFreshPositions("bitunix");

        expect(ports.hydratePositions).toHaveBeenCalledTimes(1);
        expect(ports.updatePosition).not.toHaveBeenCalled();
    });

    it("returns the paper book and sends nothing to a venue", async () => {
        const paper = [venuePosition({ symbol: "ETHUSDT" })];
        const ports = makePorts({
            paperFeed: () => ({ positions: () => paper }),
            activeKeys: unexpected("activeKeys in paper mode"),
        });
        const service = createPositionLifecycleService(ports);

        expect(await service.readFreshPositions("bitget")).toEqual(paper);
        expect(exchangeSignedFetchMock).not.toHaveBeenCalled();
    });

    it("returns null rather than an empty list when there are no credentials", async () => {
        // Null and [] mean opposite things to the caller: null is "nothing
        // proven", which evicts nothing and verifies nothing.
        const ports = makePorts({ activeKeys: () => null });
        const service = createPositionLifecycleService(ports);

        expect(await service.readFreshPositions("bitget")).toBeNull();
        expect(exchangeSignedFetchMock).not.toHaveBeenCalled();
    });
});

describe("positionLifecycle flat verification", () => {
    beforeEach(() => {
        exchangeSignedFetchMock.mockReset();
    });

    it("reports the symbols still open, deduplicated", async () => {
        exchangeSignedFetchMock.mockResolvedValue(
            positionsResponse([
                venuePosition(),
                venuePosition(),
                venuePosition({ symbol: "ETHUSDT" }),
            ]),
        );
        const ports = makePorts();
        const service = createPositionLifecycleService(ports);

        expect(await service.verifyFlat("bitget")).toEqual({
            leftover: ["BTCUSDT", "ETHUSDT"],
            unverified: false,
        });
    });

    it("narrows to the requested symbol but still evicts account-wide", async () => {
        exchangeSignedFetchMock.mockResolvedValue(
            positionsResponse([
                venuePosition(),
                venuePosition({ symbol: "ETHUSDT" }),
            ]),
        );
        const ports = makePorts();
        const service = createPositionLifecycleService(ports);

        expect(await service.verifyFlat("bitget", "BTCUSDT")).toEqual({
            leftover: ["BTCUSDT"],
            unverified: false,
        });
    });

    it("reports unverified — never flat — when the read itself fails", async () => {
        // A verification that throws would be read by the caller as a failure
        // of the flatten; swallowing it into "no leftovers" would report
        // success for a run nobody confirmed.
        exchangeSignedFetchMock.mockRejectedValue(new Error("network down"));
        const ports = makePorts();
        const service = createPositionLifecycleService(ports);

        expect(await service.verifyFlat("bitget")).toEqual({
            leftover: [],
            unverified: true,
        });
    });

    it("reports unverified when there are no credentials to prove anything with", async () => {
        const ports = makePorts({ activeKeys: () => null });
        const service = createPositionLifecycleService(ports);

        expect(await service.verifyFlat("bitget")).toEqual({
            leftover: [],
            unverified: true,
        });
    });
});

describe("positionLifecycle ghost eviction (BUG-0527)", () => {
    beforeEach(() => {
        exchangeSignedFetchMock.mockReset();
    });

    it("drops only keys this lane mirrored, and never one the venue still lists", async () => {
        // Mirror two positions, then the venue reports only one of them: the
        // missing one must go, the present one must stay.
        exchangeSignedFetchMock.mockResolvedValue(
            positionsResponse([
                venuePosition({ symbol: "BTCUSDT" }),
                venuePosition({ symbol: "ETHUSDT" }),
            ]),
        );
        const ports = makePorts();
        const service = createPositionLifecycleService(ports);
        await service.readFreshPositions("bitget");

        exchangeSignedFetchMock.mockResolvedValue(
            positionsResponse([venuePosition({ symbol: "BTCUSDT" })]),
        );
        await service.verifyFlat("bitget");

        expect(ports.removePosition).toHaveBeenCalledTimes(1);
        expect(ports.removePosition).toHaveBeenCalledWith("ETHUSDT", "long");
    });

    it("never touches an OMS entry it did not mirror", async () => {
        // The Bitunix WS feed writes entries with real positionIds that this
        // lane has no record of; evicting one would delete a live position.
        exchangeSignedFetchMock.mockResolvedValue(positionsResponse([]));
        const ports = makePorts();
        const service = createPositionLifecycleService(ports);

        await service.verifyFlat("bitget");

        expect(ports.removePosition).not.toHaveBeenCalled();
    });

    // Recorded rather than left silent: the shape guard inside
    // `evictMirroredGhosts` (`side === "long" | "short"`) survives a mutation
    // that widens it, and that is expected. `mirroredOmsKeys` only ever
    // receives `${symbol}:${long|short}` from `mirrorPositionsToOms`, so a
    // malformed key cannot be constructed through any path and the guard is
    // unreachable by design rather than untested by oversight. What is pinned
    // is the eviction *policy* -- which key leaves, with which symbol and side
    // -- by the two tests above.
});

describe("positionLifecycle staleness (200 ms rule)", () => {
    beforeEach(() => {
        exchangeSignedFetchMock.mockReset();
    });

    it("refreshes and refuses to trust a stale position", async () => {
        const fresh = { symbol: "BTCUSDT", side: "long" as const, lastUpdated: Date.now() };
        const stale = { ...fresh, lastUpdated: Date.now() - 5_000 };
        const getPositions = vi.fn().mockReturnValueOnce([stale]).mockReturnValue([fresh]);
        exchangeSignedFetchMock.mockResolvedValue(
            positionsResponse([venuePosition({ size: "2" })]),
        );
        const ports = makePorts({ getPositions });
        const service = createPositionLifecycleService(ports);

        expect(await service.ensurePositionFreshness("BTCUSDT", "long")).toBe(fresh);
        expect(getPositions).toHaveBeenCalledTimes(2);
    });

    it("aborts rather than sizing a stale position when the refresh fails", async () => {
        const stale = {
            symbol: "BTCUSDT",
            side: "long" as const,
            lastUpdated: Date.now() - 5_000,
        };
        exchangeSignedFetchMock.mockRejectedValue(new Error("venue down"));
        const ports = makePorts({ getPositions: () => [stale] });
        const service = createPositionLifecycleService(ports);

        // The whole point of the rule: a stale amount must never reach a close.
        await expect(
            service.ensurePositionFreshness("BTCUSDT", "long"),
        ).rejects.toThrow();
    });

    it("does not refresh a position that is fresh enough", async () => {
        const ports = makePorts({
            getPositions: () => [
                { symbol: "BTCUSDT", side: "long" as const, lastUpdated: Date.now() },
            ],
            beginPositionsRead: unexpected("beginPositionsRead"),
        });
        const service = createPositionLifecycleService(ports);

        await service.ensurePositionFreshness("BTCUSDT", "long");

        expect(exchangeSignedFetchMock).not.toHaveBeenCalled();
    });
});

describe("positionLifecycle bitunix pending feed", () => {
    beforeEach(() => {
        exchangeSignedFetchMock.mockReset();
    });

    /** The `/api/sync/positions-pending` envelope: `data` is the list itself. */
    function pendingResponse(items: unknown[]) {
        const envelope = JSON.stringify({ code: "0", data: items, msg: "ok" });
        return {
            ok: true,
            status: 200,
            json: async () => JSON.parse(envelope),
            text: async () => envelope,
        };
    }

    it("maps a valid pending item into the OMS on bitunix refresh", async () => {
        exchangeSignedFetchMock.mockResolvedValue(
            pendingResponse([venuePosition()]),
        );
        const ports = makePorts({ activeProvider: () => "bitunix" });
        const service = createPositionLifecycleService(ports);

        await service.refreshPositionsForProvider();

        expect(ports.updatePosition).toHaveBeenCalledTimes(1);
        expect(ports.updatePosition).toHaveBeenCalledWith(
            expect.objectContaining({ symbol: "BTCUSDT", side: "long" }),
        );
    });

    it("skips an invalid pending item without throwing or touching the OMS for it", async () => {
        exchangeSignedFetchMock.mockResolvedValue(
            pendingResponse([venuePosition(), { bogus: true }]),
        );
        const ports = makePorts({ activeProvider: () => "bitunix" });
        const service = createPositionLifecycleService(ports);

        await service.refreshPositionsForProvider();

        // Best-effort processing: the valid item lands, the malformed one is
        // skipped (and counted) rather than failing the batch.
        expect(ports.updatePosition).toHaveBeenCalledTimes(1);
    });

    it("sends nothing without credentials, even on bitunix", async () => {
        const ports = makePorts({
            activeProvider: () => "bitunix",
            activeKeys: () => ({ key: "", secret: "" }),
        });
        const service = createPositionLifecycleService(ports);

        await service.refreshPositionsForProvider();

        expect(exchangeSignedFetchMock).not.toHaveBeenCalled();
        expect(ports.updatePosition).not.toHaveBeenCalled();
    });

    it("lets the paper book own the venue: no REST mirror on paper", async () => {
        // `refreshPositionsForProvider` consults the paper feed before any
        // venue read (non-bitunix lane): a REST mirror would shadow the
        // simulator's book with venue truth in the money path. This pins the
        // outcome, not the specific line — `readFreshPositions` carries the
        // same guard one layer down, so removing the one here alone stays
        // green (verified by mutation). Both must go before paper traffic
        // reaches a venue, and this is the test that notices.
        const ports = makePorts({
            activeProvider: () => "bitget",
            paperFeed: () => ({ positions: () => [] }),
        });
        const service = createPositionLifecycleService(ports);

        await service.refreshPositionsForProvider();

        expect(exchangeSignedFetchMock).not.toHaveBeenCalled();
        expect(ports.updatePosition).not.toHaveBeenCalled();
    });
});