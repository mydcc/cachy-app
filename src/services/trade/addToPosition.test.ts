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
 * The port contract for the add lane.
 *
 * The facade suites cover the add through the `tradeService` singleton.
 * That cannot reach this module's own seams: whether a corrupt amount is
 * refused before the position is even re-read, and whether the gate
 * receives the previewed quantity and the attributable stop rather than
 * recomputed values. Injecting the ports is what makes those observable.
 */

import { describe, it, expect, vi } from "vitest";
import { Decimal } from "decimal.js";
import {
    createAddToPositionService,
    type AddToPositionPorts,
} from "./addToPosition";
import { TRADE_ERRORS } from "./tradeErrors";
import type { OMSPosition } from "../omsTypes";

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
 * Typed as `AddToPositionPorts` with no cast: adding a required port to the
 * interface fails compilation here until a default is added, which is the
 * point — a new dependency must be a conscious choice, not a silent import.
 */
function ports(overrides: Partial<AddToPositionPorts> = {}): AddToPositionPorts {
    return {
        ensurePositionFreshness: async () => position(),
        gatedRequest: () => {
            throw new Error("unexpected gatedRequest");
        },
        effectFor: (effect) => effect,
        bitgetUtaOpenFields: () => {
            throw new Error("unexpected bitgetUtaOpenFields");
        },
        activeVenue: () => "bitunix",
        lookupSymbolMeta: () => undefined,
        usdtBalance: () => undefined,
        accountSizeText: () => "10000",
        remoteAccountStateAt: () => 456,
        restingStopPrice: () => null,
        ...overrides,
    };
}

describe("addToPosition lane", () => {
    it("refuses a non-positive amount before reading anything", async () => {
        const ensurePositionFreshness = vi.fn();
        const gatedRequest = vi.fn();
        const svc = createAddToPositionService(
            ports({ ensurePositionFreshness, gatedRequest }),
        );

        await expect(
            svc.addToPosition({
                symbol: "BTCUSDT",
                positionSide: "long",
                amount: new Decimal(0),
            }),
        ).rejects.toThrow("apiErrors.invalidAmount");
        expect(ensurePositionFreshness).not.toHaveBeenCalled();
        expect(gatedRequest).not.toHaveBeenCalled();
    });

    it("refuses a missing position before building anything", async () => {
        const gatedRequest = vi.fn();
        const svc = createAddToPositionService(
            ports({ ensurePositionFreshness: async () => undefined, gatedRequest }),
        );

        await expect(
            svc.addToPosition({
                symbol: "BTCUSDT",
                positionSide: "long",
                amount: new Decimal("0.1"),
            }),
        ).rejects.toThrow(TRADE_ERRORS.POSITION_NOT_FOUND);
        expect(gatedRequest).not.toHaveBeenCalled();
    });

    it("sends kind add with the stated quantity and the attributable stop", async () => {
        const seen: unknown[] = [];
        const gatedRequest = vi.fn().mockImplementation(async (intent: unknown) => {
            seen.push(intent);
            return { code: "0" };
        });
        const svc = createAddToPositionService(
            ports({
                gatedRequest,
                restingStopPrice: () => new Decimal(49500),
                usdtBalance: () => ({ available: new Decimal(5000), at: 123 }),
            }),
        );

        const { clientId, result } = await svc.addToPosition({
            symbol: "BTCUSDT",
            positionSide: "long",
            amount: new Decimal("0.1"),
        });

        expect(clientId).toMatch(/^cachy-/);
        expect(result).toEqual({ code: "0" });
        expect(seen).toHaveLength(1);
        const intent = seen[0] as {
            kind: unknown;
            payload: Record<string, unknown>;
            displayed: Record<string, unknown>;
            confirmAs: unknown;
        };
        expect(intent.kind).toBe("add");
        // An add is an order placement; the confirmation catalogue has no
        // second key for it.
        expect(intent.confirmAs).toBe("place-order");
        expect(intent.payload["tradeSide"]).toBe("OPEN");
        expect(intent.payload["reduceOnly"]).toBe(false);
        expect(intent.payload["qty"]).toBe("0.1");
        // Stated, never recomputed: the gate has no second way to derive it.
        expect((intent.displayed["addQuantity"] as Decimal).toString()).toBe("0.1");
        expect((intent.displayed["restingStopPrice"] as Decimal).toString()).toBe("49500");
        expect((intent.displayed["accountSize"] as Decimal).toString()).toBe("10000");
        expect(intent.displayed["availableMarginAt"]).toBe(123);
        expect(intent.displayed["accountStateAt"]).toBe(456);
    });
});
