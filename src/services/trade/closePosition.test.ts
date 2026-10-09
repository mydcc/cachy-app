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
 * The port contract for the single-close lane.
 *
 * The facade suites cover the close through the `tradeService` singleton.
 * That cannot reach this module's own seams: whether an amount-less close
 * without full-close intent is refused before the gate, whether naming the
 * full amount explicitly still counts as a full close (FEAT-0256), and
 * whether the outcome is reported through the effects port. Injecting the
 * ports is what makes those observable.
 */

import { describe, it, expect, vi } from "vitest";
import { Decimal } from "decimal.js";
import {
    createClosePositionService,
    type ClosePositionPorts,
} from "./closePosition";
import { TRADE_ERRORS } from "./tradeErrors";
import type { OMSPosition } from "../omsTypes";

const loggerMock = vi.hoisted(() => ({
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
}));
vi.mock("../logger", () => ({
    logger: loggerMock,
}));

function position(): OMSPosition {
    return {
        symbol: "BTCUSDT",
        side: "long",
        amount: new Decimal("0.5"),
        entryPrice: new Decimal(50000),
        unrealizedPnl: new Decimal(10),
        leverage: new Decimal(10),
        marginMode: "isolated",
        positionId: "pos-1",
        markPrice: new Decimal(51000),
    } as OMSPosition;
}

/**
 * Ports that fail loudly on anything they are not supposed to reach, so an
 * unexpected call is an assertion failure rather than a silent pass.
 *
 * Typed as `ClosePositionPorts` with no cast: adding a required port to the
 * interface fails compilation here until a default is added, which is the
 * point — a new dependency must be a conscious choice, not a silent import.
 */
function ports(overrides: Partial<ClosePositionPorts> = {}): ClosePositionPorts {
    return {
        ensurePositionFreshness: async () => position(),
        gatedRequest: () => {
            throw new Error("unexpected gatedRequest");
        },
        bitgetUtaCloseFields: () => {
            throw new Error("unexpected bitgetUtaCloseFields");
        },
        activeVenue: () => "bitunix",
        lookupSymbolMeta: () => undefined,
        notifyTradeResult: () => {},
        ...overrides,
    };
}

describe("closePosition lane", () => {
    it("refuses an amount-less close without full-close intent before the gate", async () => {
        const gatedRequest = vi.fn();
        const svc = createClosePositionService(ports({ gatedRequest }));

        await expect(
            svc.closePosition({ symbol: "BTCUSDT", positionSide: "long" }),
        ).rejects.toThrow("apiErrors.invalidAmount");
        expect(gatedRequest).not.toHaveBeenCalled();
    });

    it("refuses a missing position before building anything", async () => {
        const gatedRequest = vi.fn();
        const svc = createClosePositionService(
            ports({ ensurePositionFreshness: async () => undefined, gatedRequest }),
        );

        await expect(
            svc.closePosition({ symbol: "BTCUSDT", positionSide: "long", forceFullClose: true }),
        ).rejects.toThrow(TRADE_ERRORS.POSITION_NOT_FOUND);
        expect(gatedRequest).not.toHaveBeenCalled();
    });

    it("treats naming the full amount explicitly as a full close", async () => {
        const seen: unknown[] = [];
        const gatedRequest = vi.fn().mockImplementation(async (intent: unknown) => {
            seen.push(intent);
            return { code: "0" };
        });
        const notified: Array<{ kind: string; pnl: Decimal }> = [];
        const svc = createClosePositionService(
            ports({
                gatedRequest,
                notifyTradeResult: (kind, pnl) => {
                    notified.push({ kind, pnl });
                },
            }),
        );

        // The positions panel passes the size it read off the position —
        // that must not flip the close into a partial (FEAT-0256), or an
        // exit from a sub-step-size position would be refused.
        await svc.closePosition({
            symbol: "BTCUSDT",
            positionSide: "long",
            amount: new Decimal("0.5"),
        });

        expect(seen).toHaveLength(1);
        const intent = seen[0] as {
            payload: Record<string, unknown>;
            displayed: Record<string, unknown>;
        };
        expect(intent.payload["reduceOnly"]).toBe(true);
        expect(intent.payload["tradeSide"]).toBe("CLOSE");
        expect(intent.displayed["fullClose"]).toBe(true);
        expect(intent.displayed["positionId"]).toBe("pos-1");
        // A winning close reports a win with the realised figure.
        expect(notified).toHaveLength(1);
        expect(notified[0]?.kind).toBe("trade_win");
        expect(notified[0]?.pnl.toString()).toBe("10");
    });

    it("marks a genuine partial with its minimum, and reports a loss as a loss", async () => {
        const seen: unknown[] = [];
        const gatedRequest = vi.fn().mockImplementation(async (intent: unknown) => {
            seen.push(intent);
            return { code: "0" };
        });
        const notified: string[] = [];
        const svc = createClosePositionService(
            ports({
                gatedRequest,
                ensurePositionFreshness: async () => ({
                    ...position(),
                    unrealizedPnl: new Decimal(-5),
                }),
                lookupSymbolMeta: () => ({
                    symbol: "BTCUSDT",
                    minTradeVolume: new Decimal("0.001"),
                }),
                notifyTradeResult: (kind) => {
                    notified.push(kind);
                },
            }),
        );

        await svc.closePosition({
            symbol: "BTCUSDT",
            positionSide: "long",
            amount: new Decimal("0.1"),
        });

        const intent = seen[0] as { displayed: Record<string, unknown> };
        expect(intent.displayed["fullClose"]).toBe(false);
        expect(intent.displayed["minTradeVolume"]).toBeInstanceOf(Decimal);
        expect(notified).toEqual(["trade_loss"]);
    });
});
