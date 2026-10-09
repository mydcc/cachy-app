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
 * The port contract for the close-all lane.
 *
 * The facade suites cover the flatten through the `tradeService`
 * singleton. That cannot reach this module's own seams: whether the
 * bitunix path verifies flat after the bulk close instead of trusting it,
 * whether the fallback flattens through the single-close lane with full
 * intent, and whether the catch tail reports exactly once through the
 * owner-side port. Injecting the ports is what makes those observable.
 */

import { describe, it, expect, vi } from "vitest";
import {
    createCloseAllPositionsService,
    type CloseAllPositionsPorts,
} from "./closeAllPositions";
import { TRADE_ERRORS } from "./tradeErrors";

const loggerMock = vi.hoisted(() => ({
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
}));
vi.mock("../logger", () => ({
    logger: loggerMock,
}));

/**
 * Ports that fail loudly on anything they are not supposed to reach, so an
 * unexpected call is an assertion failure rather than a silent pass.
 *
 * Typed as `CloseAllPositionsPorts` with no cast: adding a required port to
 * the interface fails compilation here until a default is added, which is
 * the point — a new dependency must be a conscious choice, not a silent
 * import.
 */
function ports(overrides: Partial<CloseAllPositionsPorts> = {}): CloseAllPositionsPorts {
    return {
        activeVenue: () => "bitunix",
        gatedRequest: () => {
            throw new Error("unexpected gatedRequest");
        },
        readFreshPositions: async () => [],
        verifyFlat: async () => ({ leftover: [], unverified: false }),
        reportFlattenShortfall: () => {
            throw new Error("unexpected reportFlattenShortfall");
        },
        closePosition: async () => {
            throw new Error("unexpected closePosition");
        },
        cachedPositions: () => {
            throw new Error("unexpected cachedPositions");
        },
        reportCloseAllFailure: () => {
            throw new Error("unexpected reportCloseAllFailure");
        },
        ...overrides,
    };
}

describe("closeAllPositions lane", () => {
    it("sends the native bulk close on bitunix and trusts nothing without verification", async () => {
        const seen: unknown[] = [];
        const gatedRequest = vi.fn().mockImplementation(async (intent: unknown) => {
            seen.push(intent);
            return { code: "0" };
        });
        const verifyFlat = vi.fn(async () => ({ leftover: [], unverified: false }));
        const reportFlattenShortfall = vi.fn();
        const svc = createCloseAllPositionsService(
            ports({ gatedRequest, verifyFlat, reportFlattenShortfall }),
        );

        const result = await svc.closeAllPositions();

        expect(result).toEqual({ code: "0" });
        expect(seen).toHaveLength(1);
        const intent = seen[0] as { kind: unknown; payload: Record<string, unknown> };
        expect(intent.kind).toBe("bulk");
        expect(intent.payload["type"]).toBe("close-all-positions");
        // Verified after the bulk close: a mid-flatten race or partial fill
        // must not report success while anything remains open.
        expect(verifyFlat).toHaveBeenCalledWith("bitunix", undefined);
        expect(reportFlattenShortfall).not.toHaveBeenCalled();
    });

    it("names the shortfall when the bulk close leaves anything open", async () => {
        const gatedRequest = vi.fn(async () => ({ code: "0" }));
        const reportFlattenShortfall = vi.fn((args: unknown): never => {
            throw new Error(TRADE_ERRORS.CLOSE_ALL_FAILED, { cause: args });
        });
        const svc = createCloseAllPositionsService(
            ports({
                gatedRequest,
                verifyFlat: async () => ({ leftover: ["ETHUSDT"], unverified: false }),
                reportFlattenShortfall,
            }),
        );

        await expect(svc.closeAllPositions()).rejects.toThrow(
            TRADE_ERRORS.CLOSE_ALL_FAILED,
        );
        expect(reportFlattenShortfall).toHaveBeenCalledWith(
            expect.objectContaining({ leftover: ["ETHUSDT"] }),
        );
    });

    it("flattens through the single-close lane with full intent on the fallback path", async () => {
        const closed: unknown[] = [];
        const closePosition = vi.fn(async (params: unknown) => {
            closed.push(params);
            return { code: "0" };
        });
        const svc = createCloseAllPositionsService(
            ports({
                activeVenue: () => "bitget",
                readFreshPositions: async () => [
                    { symbol: "BTCUSDT", side: "LONG", marginMode: "CROSS" },
                    { symbol: "ETHUSDT", side: "SHORT", marginMode: "ISOLATED" },
                ],
                closePosition,
                verifyFlat: async () => ({ leftover: [], unverified: false }),
                reportFlattenShortfall: () => {
                    throw new Error("should stay flat");
                },
            }),
        );

        await svc.closeAllPositions();

        expect(closed).toEqual([
            { symbol: "BTCUSDT", positionSide: "long", forceFullClose: true },
            { symbol: "ETHUSDT", positionSide: "short", forceFullClose: true },
        ]);
    });

    it("reports once through the owner-side port when the run itself fails", async () => {
        const cause = new Error("boom");
        const gatedRequest = vi.fn(async (): Promise<unknown> => {
            throw cause;
        });
        const reported: unknown[] = [];
        const reportCloseAllFailure = vi.fn((symbol: unknown, e: unknown): never => {
            reported.push([symbol, e]);
            throw new Error(TRADE_ERRORS.CLOSE_ALL_FAILED, { cause: e });
        });
        const reportFlattenShortfall = vi.fn();
        const svc = createCloseAllPositionsService(
            ports({ gatedRequest, reportCloseAllFailure, reportFlattenShortfall }),
        );

        // Already-reported shortfalls rethrow untouched (no second toast);
        // anything else funnels into the single owner-side report.
        await expect(svc.closeAllPositions("BTCUSDT")).rejects.toThrow(
            TRADE_ERRORS.CLOSE_ALL_FAILED,
        );
        expect(reported).toEqual([["BTCUSDT", cause]]);
        expect(reportFlattenShortfall).not.toHaveBeenCalled();
    });

    it("treats an unconfirmable run as a shortfall even with no leftovers", async () => {
        const gatedRequest = vi.fn(async () => ({ code: "0" }));
        const reportFlattenShortfall = vi.fn((args: unknown): never => {
            throw new Error(TRADE_ERRORS.CLOSE_ALL_FAILED, { cause: args });
        });
        const svc = createCloseAllPositionsService(
            ports({
                gatedRequest,
                verifyFlat: async () => ({ leftover: [], unverified: true }),
                reportFlattenShortfall,
            }),
        );

        // The second half of the `|| unverified` disjunction: nothing
        // provably open, but flat unconfirmable — still no success.
        await expect(svc.closeAllPositions()).rejects.toThrow(
            TRADE_ERRORS.CLOSE_ALL_FAILED,
        );
        expect(reportFlattenShortfall).toHaveBeenCalledWith(
            expect.objectContaining({ unverified: true }),
        );
    });

    it("falls back to the cached book when no read is possible", async () => {
        const closed: unknown[] = [];
        const closePosition = vi.fn(async (params: unknown) => {
            closed.push(params);
            return { code: "0" };
        });
        const cachedPositions = vi.fn(() => [
            { symbol: "BTCUSDT", side: "LONG", marginMode: "CROSS" },
        ]);
        const svc = createCloseAllPositionsService(
            ports({
                activeVenue: () => "bitget",
                readFreshPositions: async () => null,
                cachedPositions,
                closePosition,
                verifyFlat: async () => ({ leftover: [], unverified: false }),
                reportFlattenShortfall: () => {
                    throw new Error("should stay flat");
                },
            }),
        );

        // No keys to sign with: proceed on the cache best-effort (the
        // closes then refuse at signing) rather than flattening blind.
        await svc.closeAllPositions();

        expect(cachedPositions).toHaveBeenCalled();
        expect(closed).toEqual([
            { symbol: "BTCUSDT", positionSide: "long", forceFullClose: true },
        ]);
    });

    it("never reports success when a shortfall report returns instead of throwing", async () => {
        const gatedRequest = vi.fn(async () => ({ code: "0" }));
        const reportFlattenShortfall = vi.fn(() => {});
        const svc = createCloseAllPositionsService(
            ports({
                gatedRequest,
                verifyFlat: async () => ({ leftover: ["ETHUSDT"], unverified: false }),
                reportFlattenShortfall,
            }),
        );

        // Contract violation by the port (typed void, implemented to
        // throw): the lane's fallthrough guard still refuses.
        await expect(svc.closeAllPositions()).rejects.toThrow(
            TRADE_ERRORS.CLOSE_ALL_FAILED,
        );
    });

    it("never reports success on the fallback when a shortfall report returns", async () => {
        const closePosition = vi.fn(async () => ({ code: "0" }));
        const reportFlattenShortfall = vi.fn(() => {});
        const svc = createCloseAllPositionsService(
            ports({
                activeVenue: () => "bitget",
                readFreshPositions: async () => [
                    { symbol: "BTCUSDT", side: "LONG", marginMode: "CROSS" },
                ],
                closePosition,
                verifyFlat: async () => ({ leftover: [], unverified: true }),
                reportFlattenShortfall,
            }),
        );

        await expect(svc.closeAllPositions()).rejects.toThrow(
            TRADE_ERRORS.CLOSE_ALL_FAILED,
        );
    });

    it("never resolves when the catch-tail report returns instead of throwing", async () => {
        const cause = new Error("boom");
        const gatedRequest = vi.fn(async (): Promise<unknown> => {
            throw cause;
        });
        const reportCloseAllFailure = vi.fn(() => {});
        const svc = createCloseAllPositionsService(
            ports({ gatedRequest, reportCloseAllFailure }),
        );

        await expect(svc.closeAllPositions()).rejects.toThrow(
            TRADE_ERRORS.CLOSE_ALL_FAILED,
        );
    });
});
