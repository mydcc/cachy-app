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
 * The port contract for the flash-close lane.
 *
 * `tradeService_flashClose*.test.ts` cover the close through the `tradeService`
 * singleton with the store layer mocked. That cannot reach this module's own
 * seams: whether the gate verification runs before anything has a side
 * effect, or whether a terminal failure removes the optimistic order while an
 * indeterminate one parks it. Injecting the ports is what makes those
 * observable — every sibling module in this directory already ships a suite
 * of its own for the same reason.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "decimal.js";
import {
    createFlashCloseService,
    type FlashClosePorts,
} from "./flashClose";
import { BitunixApiError } from "./tradeErrors";
import { OrderRefusedError } from "../orderGate";
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

// The recovery sync retries with backoff; the lane only needs to know it is
// kicked off, so it runs synchronously here.
vi.mock("../../utils/retryPolicy", () => ({
    RetryPolicy: {
        execute: (fn: () => Promise<unknown>) => fn(),
    },
}));

// The gate itself is policy, not lane logic — but the lane's contract is
// *when* the verification runs (before anything with a side effect), so the
// seam is a spy in the refusal test while every other test runs the real
// gate. Note the lane calls it as a method (`orderGate.verifyOrThrow`), so
// only a spy — not an export mock — can observe or control it.
import { orderGate } from "../orderGate";

const omsState = vi.hoisted(() => ({
    orders: new Map<string, Record<string, unknown>>(),
}));
vi.mock("../omsService", () => ({
    omsService: {
        addOptimisticOrder: vi.fn((o: Record<string, unknown>) => {
            omsState.orders.set(o["id"] as string, { ...o });
        }),
        removeOrder: vi.fn((id: string) => {
            omsState.orders.delete(id);
        }),
        getOrder: vi.fn((id: string) => omsState.orders.get(id)),
        updateOrder: vi.fn((o: Record<string, unknown>) => {
            omsState.orders.set(o["id"] as string, { ...o });
        }),
    },
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
 * Typed as `FlashClosePorts` with no cast: adding a required port to the
 * interface fails compilation here until a default is added, which is the
 * point — a new dependency must be a conscious choice, not a silent import.
 */
function ports(overrides: Partial<FlashClosePorts> = {}): FlashClosePorts {
    return {
        gatedRequest: () => {
            throw new Error("unexpected gatedRequest");
        },
        displayedAccount: () => ({
            provider: "bitunix",
            accountFingerprint: "fp",
            accountId: "a1",
            paperMode: false,
        }),
        ensurePositionFreshness: async () => position(),
        bitgetUtaCloseFields: () => {
            throw new Error("unexpected bitgetUtaCloseFields");
        },
        cancelAllOrders: async () => {
            throw new Error("unexpected cancelAllOrders");
        },
        refreshPositionsForProvider: async () => {
            throw new Error("unexpected refreshPositionsForProvider");
        },
        activeVenue: () => "bitunix",
        lastPrice: () => new Decimal(51000),
        triggerDuckEvent: () => {},
        t: (key) => key,
        notifyFailure: () => {},
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    omsState.orders.clear();
    vi.restoreAllMocks();
});

describe("flashClose lane", () => {
    it("refuses before anything has a side effect when the gate says no", async () => {
        const cancelAllOrders = vi.fn();
        const gatedRequest = vi.fn();
        vi.spyOn(orderGate, "verifyOrThrow").mockImplementation(() => {
            throw new OrderRefusedError({
                field: "mode",
                reason: "unsupported",
                messageKey: "k",
                values: {},
            });
        });
        const svc = createFlashCloseService(
            ports({ cancelAllOrders, gatedRequest }),
        );

        const result = await svc.flashClosePosition("BTCUSDT", "long");

        // BUG-0331: the cancel below removes the position's protection, so a
        // refusal must land before it — and before the optimistic order that
        // would otherwise need rolling back.
        expect(result).toEqual({ success: false, error: expect.any(String) });
        expect(gatedRequest).not.toHaveBeenCalled();
        expect(cancelAllOrders).not.toHaveBeenCalled();
        expect(omsState.orders.size).toBe(0);
    });

    it("removes the optimistic order on a terminal API failure", async () => {
        const gatedRequest = vi.fn().mockRejectedValue(new BitunixApiError(400, "x"));
        const notified: string[] = [];
        const svc = createFlashCloseService(
            ports({
                gatedRequest,
                cancelAllOrders: async () => {},
                notifyFailure: (msg) => {
                    notified.push(msg);
                },
            }),
        );

        const result = await svc.flashClosePosition("BTCUSDT", "long");

        // A refusal-shaped failure proves the venue answered: nothing is in
        // flight, so the optimistic order is removed, not parked — and the
        // trader is told exactly what the lane reports.
        expect(result.success).toBe(false);
        expect(omsState.orders.size).toBe(0);
        expect(notified).toHaveLength(1);
        expect(notified[0]).toBe((result as { error: string }).error);
    });

    it("parks the optimistic order and syncs on an indeterminate failure", async () => {
        const refreshPositionsForProvider = vi.fn().mockResolvedValue(undefined);
        const gatedRequest = vi.fn().mockRejectedValue(new Error("socket hang up"));
        const svc = createFlashCloseService(
            ports({
                gatedRequest,
                cancelAllOrders: async () => {},
                refreshPositionsForProvider,
            }),
        );

        const result = await svc.flashClosePosition("BTCUSDT", "long");

        expect(result.success).toBe(false);
        expect(omsState.orders.size).toBe(1);
        const [order] = [...omsState.orders.values()];
        expect(order["_isUnconfirmed"]).toBe(true);
        expect(refreshPositionsForProvider).toHaveBeenCalled();
    });

    it("still reports success when the post-close stop cancel fails", async () => {
        const cancelAllOrders = vi.fn().mockRejectedValue(new Error("504"));
        const gatedRequest = vi.fn().mockResolvedValue({ code: "0" });
        const notified: string[] = [];
        const svc = createFlashCloseService(
            ports({
                gatedRequest,
                cancelAllOrders,
                notifyFailure: (msg) => {
                    notified.push(msg);
                },
            }),
        );

        const result = await svc.flashClosePosition("BTCUSDT", "long");

        // The position is flat; the surviving stops are a cleanup problem the
        // trader is told about, not an execution failure.
        expect(result).toEqual({ success: true, data: { code: "0" } });
        expect(cancelAllOrders).toHaveBeenCalledTimes(1);
        expect(notified).toHaveLength(0);
    });

    it("refuses a missing position before anything has a side effect", async () => {
        const cancelAllOrders = vi.fn();
        const gatedRequest = vi.fn();
        const svc = createFlashCloseService(
            ports({
                cancelAllOrders,
                gatedRequest,
                ensurePositionFreshness: async () => undefined,
            }),
        );

        const result = await svc.flashClosePosition("BTCUSDT", "long");

        expect(result).toEqual({
            success: false,
            error: "tradeErrors.positionNotFound",
        });
        expect(gatedRequest).not.toHaveBeenCalled();
        expect(cancelAllOrders).not.toHaveBeenCalled();
        expect(omsState.orders.size).toBe(0);
    });

    it("refuses a zero-size position before anything has a side effect", async () => {
        const cancelAllOrders = vi.fn();
        const gatedRequest = vi.fn();
        const svc = createFlashCloseService(
            ports({
                cancelAllOrders,
                gatedRequest,
                ensurePositionFreshness: async () => ({
                    ...position(),
                    amount: new Decimal(0),
                }),
            }),
        );

        const result = await svc.flashClosePosition("BTCUSDT", "long");

        expect(result).toEqual({ success: false, error: "apiErrors.invalidAmount" });
        expect(gatedRequest).not.toHaveBeenCalled();
        expect(cancelAllOrders).not.toHaveBeenCalled();
        expect(omsState.orders.size).toBe(0);
    });

    it("sends the venue-native close on bitunix", async () => {
        const seen: unknown[] = [];
        const ducked: unknown[] = [];
        const gatedRequest = vi.fn().mockImplementation(async (intent: unknown) => {
            seen.push(intent);
            return { code: "0" };
        });
        const cancelAllOrders = vi.fn().mockResolvedValue({});
        const svc = createFlashCloseService(
            ports({
                gatedRequest,
                cancelAllOrders,
                triggerDuckEvent: (event) => {
                    ducked.push(event);
                },
            }),
        );

        await svc.flashClosePosition("BTCUSDT", "long", 12345);

        expect(seen).toHaveLength(1);
        const intent = seen[0] as { payload: Record<string, unknown> };
        expect(intent.payload["type"]).toBe("flash-close-position");
        expect(intent.payload["positionId"]).toBe("pos-1");
        // The stop-cancel carries the close's own authorisation, so the gate
        // does not ask twice for one confirmed action.
        expect(cancelAllOrders).toHaveBeenCalledWith("BTCUSDT", true, {
            action: "flash-close-position",
            confirmedAt: 12345,
        });
        // Positive unrealised PnL reports a win with the position's figure.
        expect(ducked).toHaveLength(1);
        expect(ducked[0]).toMatchObject({ type: "trade_win" });
    });

    it("sends UTA fields on bitget", async () => {
        const seen: unknown[] = [];
        const gatedRequest = vi.fn().mockImplementation(async (intent: unknown) => {
            seen.push(intent);
            return { code: "0" };
        });
        const svc = createFlashCloseService(
            ports({
                gatedRequest,
                cancelAllOrders: async () => ({}),
                activeVenue: () => "bitget",
                bitgetUtaCloseFields: () => ({
                    side: "SELL" as const,
                    posSide: "LONG" as const,
                    reduceOnly: false,
                    marginMode: "isolated",
                }),
            }),
        );

        await svc.flashClosePosition("BTCUSDT", "long");

        expect(seen).toHaveLength(1);
        const intent = seen[0] as { payload: Record<string, unknown> };
        // The UTA spread travels last, so its transactional side wins over
        // the position-side convention of the Bitunix branch.
        expect(intent.payload["type"]).toBe("place-order");
        expect(intent.payload["side"]).toBe("SELL");
        expect(intent.payload["posSide"]).toBe("LONG");
    });
});
