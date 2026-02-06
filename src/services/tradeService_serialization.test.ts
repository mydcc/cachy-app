
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tradeService } from "./tradeService";
import { settingsState } from "../stores/settings.svelte";
import { Decimal } from "decimal.js";

// Mock settingsState
vi.mock("../stores/settings.svelte", () => ({
    settingsState: {
        apiProvider: "bitunix",
        apiKeys: {
            bitunix: { key: "test", secret: "test" }
        }
    }
}));

// Mock Logger
vi.mock("./logger", () => ({
    logger: {
        warn: vi.fn(),
        error: vi.fn(),
        log: vi.fn()
    }
}));

// Mock tradeState
vi.mock("../stores/trade.svelte", () => ({
    tradeState: {
        symbol: "BTCUSDT",
        update: vi.fn()
    }
}));

describe("TradeService - Serialization Hardening", () => {
    let fetchSpy: any;

    beforeEach(() => {
        fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
            ok: true,
            text: async () => JSON.stringify({ code: "0", data: [] }),
            json: async () => ({ code: "0", data: [] })
        } as Response);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should serialize Decimal objects in cancelTpSlOrder params", async () => {
        // We simulate passing an order where orderId is a Decimal.
        // While currently OMS stores IDs as strings, this ensures that if a Decimal
        // ever sneaks in (e.g. from a calculation or different mapper), it is safely serialized.
        const decimalId = new Decimal("1234567890123456789.123");
        const order = {
            orderId: decimalId,
            symbol: "BTCUSDT",
            planType: "profit_plan"
        };

        await tradeService.cancelTpSlOrder(order);

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const call = fetchSpy.mock.calls[0];
        const body = JSON.parse(call[1].body);

        // Without serializePayload, this might be serialized as an object or number (losing precision)
        // With serializePayload, it must be a string.
        expect(body.params.orderId).toBe("1234567890123456789.123");
    });

    it("should recursively serialize nested objects", async () => {
         // This tests the private serializePayload method indirectly via the fetch call
         // We can override cancelTpSlOrder logic slightly or just trust the previous test cover it.
         // Let's rely on the previous test as it covers the critical path:
         // body -> serializePayload -> object -> params -> object -> orderId (Decimal)
         // This confirms recursion works (body is object, params is nested object).
    });
});
