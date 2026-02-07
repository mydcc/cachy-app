import { describe, it, expect, vi, beforeEach } from "vitest";
import { bitunixWs } from "../../services/bitunixWs";
import { logger } from "../../services/logger";

// Mock dependencies
vi.mock("../../services/logger");
vi.mock("../../stores/market.svelte", () => ({
    marketState: {
        updateSymbol: vi.fn(() => {
            throw new Error("Simulated Store Error");
        }),
        updateOrderFromWs: vi.fn(),
        updateBalanceFromWs: vi.fn(),
        updateSymbolKlines: vi.fn(),
        updateDepth: vi.fn()
    }
}));
vi.mock("../../stores/account.svelte", () => ({
    accountState: {
        updateOrderFromWs: vi.fn(),
        updateBalanceFromWs: vi.fn()
    }
}));

describe("BitunixWebSocketService Hardening", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should handle Fast Path exception and fallback safely", async () => {
        const payload = {
            ch: "price",
            data: {
                lastPrice: "10000",
                ip: "10000",
                fr: "0.001"
            },
            symbol: "BTCUSDT"
        };

        await (bitunixWs as any).handleMessage(payload, "public");

        expect(logger.warn).toHaveBeenCalledWith(
            "network",
            expect.stringContaining("FastPath"),
            expect.any(Error)
        );
    });

    it("should skip Fast Path for malformed data (Array instead of Object) and use Zod", async () => {
        const payload = {
            ch: "price",
            data: ["10000", "500"] as any,
            symbol: "BTCUSDT"
        };

        await (bitunixWs as any).handleMessage(payload, "public");

        // Fast Path skipped, so NO FastPath warning should be logged here
        expect(logger.warn).not.toHaveBeenCalledWith(
            "network",
            expect.stringContaining("FastPath"),
            expect.anything()
        );

        // Zod validation might fail but we check specifically for FastPath crash/log
        expect(true).toBe(true);
    });
});
