/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * The port contract of `createTpSlService`, pinned locally.
 *
 * The five methods are covered end to end by `tradeService_tpslModify` and
 * `tradeService_tpslPlacement`, and those do catch a miswired gate — but
 * through the service, which cannot tell a wrong port from a right one
 * reached the long way round. Here the ports are the subject: what the module
 * asks of them, and what it refuses to do without them.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "decimal.js";

vi.mock("../logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../omsService", () => ({
    omsService: { getPositions: vi.fn(() => [] as Array<{ symbol: string }>) },
}));

vi.mock("../tpslNormalize", () => ({
    normalizeTpSlRows: (rows: unknown[]) => rows,
}));

import {
    createTpSlService,
    type TpSlPorts,
    type TpSlService,
} from "./tpSlService";

const ORDER = { sourceOrderId: "row-7", orderId: "row-7-tp", symbol: "BTCUSDT", planType: "PROFIT" };

function makePorts(overrides: Partial<TpSlPorts> = {}) {
    const gatedRequest = vi.fn(async () => ({ ok: true }));
    const signedRequest = vi.fn(async () => ({ rows: [] }));
    const ports: TpSlPorts = {
        gatedRequest: gatedRequest as unknown as TpSlPorts["gatedRequest"],
        signedRequest: signedRequest as unknown as TpSlPorts["signedRequest"],
        activeVenue: () => "bitunix",
        hasActiveKeys: () => true,
        isPaperMode: () => false,
        activeSymbol: () => "BTCUSDT",
        ...overrides,
    };
    return { ports, gatedRequest, signedRequest };
}

describe("createTpSlService — write ports", () => {
    let svc: TpSlService;
    let gatedRequest: ReturnType<typeof vi.fn>;
    let signedRequest: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        const made = makePorts();
        svc = createTpSlService(made.ports);
        gatedRequest = made.gatedRequest;
        signedRequest = made.signedRequest;
    });

    it("routes every write through the gate port, never the transport", async () => {
        const leg = { price: new Decimal("49000"), qty: new Decimal("1") };
        await svc.cancelTpSlOrder(ORDER as never);
        await svc.modifyTpSlOrder({
            orderId: "1",
            symbol: "BTCUSDT",
            planType: "PROFIT",
            triggerPrice: "52000",
        });
        await svc.placePositionTpSl({ symbol: "BTCUSDT", positionId: "p1", stopLoss: leg });
        await svc.placeTpSlOrder({ symbol: "BTCUSDT", positionId: "p1", stopLoss: leg });

        expect(gatedRequest).toHaveBeenCalledTimes(4);
        // The transport answers reads. A write arriving here means one of the
        // four skipped the gate, which is the one thing this module must not
        // be able to do.
        expect(signedRequest).not.toHaveBeenCalled();
    });

    // Setting a stop reduces exposure and must keep working while the kill
    // switch is engaged — which is why the kind is "modify" and not "open".
    it("declares every place as a modify, never an open", async () => {
        const leg = { price: new Decimal("49000"), qty: new Decimal("1") };
        await svc.placeTpSlOrder({ symbol: "BTCUSDT", positionId: "p1", stopLoss: leg });
        await svc.placePositionTpSl({ symbol: "BTCUSDT", positionId: "p1", stopLoss: leg });
        await svc.modifyTpSlOrder({
            orderId: "1",
            symbol: "BTCUSDT",
            planType: "LOSS",
            triggerPrice: "49000",
        });

        expect(gatedRequest).toHaveBeenCalledTimes(3);
        for (const [intent] of gatedRequest.mock.calls) {
            expect(intent.kind).toBe("modify");
            expect(intent.endpoint).toBe("/api/tpsl");
        }
    });

    it("cancels the row id, not the leg id the app invented", async () => {
        // BUG-0292: `orderId` on a normalised plan ("row-7-tp") is something
        // the venue has never heard of. The row it was split from is what
        // cancels something.
        await svc.cancelTpSlOrder(ORDER as never);

        const [intent] = gatedRequest.mock.calls[0];
        expect(intent.payload.orderId).toBe("row-7");
        expect(intent.payload.params.orderId).toBe("row-7");
    });

    // The venue reads tpPrice/slPrice per leg; a planType+triggerPrice switch
    // is a body the endpoint does not document (BUG-0293).
    it("sends per-leg price and quantity fields, not planType+triggerPrice", async () => {
        await svc.modifyTpSlOrder({
            orderId: "1",
            symbol: "BTCUSDT",
            planType: "LOSS",
            triggerPrice: "49000",
            qty: "2",
        });

        const [intent] = gatedRequest.mock.calls[0];
        expect(intent.payload.params).toEqual({
            orderId: "1",
            slPrice: "49000",
            slStopType: "MARK_PRICE",
            slQty: "2",
        });
        expect(intent.payload.params.planType).toBeUndefined();
        expect(intent.payload.params.triggerPrice).toBeUndefined();
    });

    // Each leg has to land in the slot the gate checks, or the gate is
    // measuring the wrong field (BUG-0505).
    it("states the take-profit and stop-loss legs in the displayed state", async () => {
        await svc.modifyTpSlOrder({
            orderId: "1",
            symbol: "BTCUSDT",
            planType: "PROFIT",
            triggerPrice: "52000",
            qty: "2",
            context: { side: "long", entryPrice: new Decimal("50000") },
        });

        const [intent] = gatedRequest.mock.calls[0];
        expect(intent.displayed.takeProfits).toEqual([new Decimal("52000")]);
        expect(intent.displayed.stopLossPrice).toBeUndefined();
        expect(intent.displayed.takeProfitQty).toEqual(new Decimal("2"));
        expect(intent.priceFields).toEqual({
            stopLoss: "params.slPrice",
            takeProfit: "params.tpPrice",
        });
    });

    it("refuses a plan with no leg at all", async () => {
        await expect(
            svc.placeTpSlOrder({ symbol: "BTCUSDT", positionId: "p1" }),
        ).rejects.toThrow("apiErrors.tpslNoLeg");
        await expect(
            svc.placePositionTpSl({ symbol: "BTCUSDT", positionId: "p1" }),
        ).rejects.toThrow("apiErrors.tpslNoLeg");
        expect(gatedRequest).not.toHaveBeenCalled();
    });

    // The caller's quantity is handed to the wire unrounded: `closePosition`
    // rounds because it derives a number, this one was given one.
    it("passes a fixed-quantity leg through without rounding it", async () => {
        await svc.placeTpSlOrder({
            symbol: "BTCUSDT",
            positionId: "p1",
            stopLoss: { price: new Decimal("49000.12345678"), qty: new Decimal("0.30000000001") },
        });

        const [intent] = gatedRequest.mock.calls[0];
        expect(intent.payload.params.slPrice).toBe("49000.12345678");
        expect(intent.payload.params.slQty).toBe("0.30000000001");
    });
});

describe("createTpSlService — read ports", () => {
    // FEAT-0327: a simulated read goes through the seam, so it needs no
    // credentials — but the guard must not fire before the seam is reached,
    // which is what reported a protected position as unprotected.
    it("reads in paper mode with no credentials, through the seam", async () => {
        const { ports, signedRequest } = makePorts({
            hasActiveKeys: () => false,
            isPaperMode: () => true,
        });

        await expect(createTpSlService(ports).fetchTpSlOrders()).resolves.toEqual([]);
        // Reached the seam rather than stopping at the guard.
        expect(signedRequest).toHaveBeenCalled();
    });

    // The other half: live mode with no credentials must refuse, and refuse
    // before anything reaches the network.
    it("refuses a live read with no credentials", async () => {
        const { ports, signedRequest } = makePorts({ hasActiveKeys: () => false });

        await expect(createTpSlService(ports).fetchTpSlOrders()).rejects.toThrow(
            "dashboard.alerts.noApiKeys",
        );
        expect(signedRequest).not.toHaveBeenCalled();
    });

    it("asks for the active symbol and every open position", async () => {
        const { omsService } = await import("../omsService");
        (omsService.getPositions as ReturnType<typeof vi.fn>).mockReturnValue([
            { symbol: "ETHUSDT" },
        ]);
        const { ports, signedRequest } = makePorts();

        await createTpSlService(ports).fetchTpSlOrders();

        const symbols = signedRequest.mock.calls.map(
            // [endpoint, payload] — the symbol rides inside the payload's params.
            (c: [string, { params: { symbol?: string } }]) => c[1].params.symbol,
        );
        expect(symbols).toEqual(["BTCUSDT", "ETHUSDT"]);
        (omsService.getPositions as ReturnType<typeof vi.fn>).mockReturnValue([]);
    });

    it("keeps only the venue envelope on the generic path", async () => {
        // Live-Bitget never reaches this: its adapter gates the read on
        // SUPPORTS.tpSl (false). Signing a Bitunix-only envelope with Bitget
        // keys outside paper mode is the mistake this branch avoids.
        const { ports, signedRequest } = makePorts({ activeVenue: () => "bitget" });

        await createTpSlService(ports).fetchTpSlOrders("history");

        expect(signedRequest.mock.calls[0][0]).toBe("/api/tpsl");
        expect(signedRequest.mock.calls[0][1]).toEqual({ action: "history" });
    });
});
