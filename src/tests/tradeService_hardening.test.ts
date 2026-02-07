import { describe, it, expect, vi, beforeEach } from "vitest";
import { tradeService } from "../services/tradeService";
import { Decimal } from "decimal.js";
import { settingsState } from "../stores/settings.svelte";

// Mock settings
vi.mock("../stores/settings.svelte", () => ({
    settingsState: {
        apiProvider: "bitunix",
        apiKeys: {
            bitunix: { key: "test-key", secret: "test-secret" }
        },
        appAccessToken: "test-token"
    }
}));

// Mock logger to avoid noise
vi.mock("../services/logger");

describe("TradeService Hardening", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Spy on signedRequest directly on the instance
        vi.spyOn(tradeService, "signedRequest").mockResolvedValue([]);

        // Also mock fetch to ensure we don't make network calls if signedRequest ISN'T called
        global.fetch = vi.fn().mockResolvedValue({
            text: () => Promise.resolve('{"data": []}'),
            ok: true
        });
    });

    it("fetchTpSlOrders should use signedRequest instead of direct fetch", async () => {
        // Act
        await tradeService.fetchTpSlOrders("pending");

        // Assert
        expect(tradeService.signedRequest).toHaveBeenCalledWith(
            "POST",
            "/api/tpsl",
            expect.objectContaining({
                exchange: "bitunix",
                action: "pending"
            })
        );
    });

    it("cancelTpSlOrder should use signedRequest instead of direct fetch", async () => {
        // Arrange
        const order = { orderId: "123", symbol: "BTCUSDT", planType: "profit_plan" };

        // Act
        await tradeService.cancelTpSlOrder(order);

        // Assert
        expect(tradeService.signedRequest).toHaveBeenCalledWith(
            "POST",
            "/api/tpsl",
            expect.objectContaining({
                exchange: "bitunix",
                action: "cancel",
                params: expect.objectContaining({
                    orderId: "123"
                })
            })
        );
    });
});
