
import { describe, it, expect, vi } from "vitest";
import { POST } from "./+server";

describe("Order API Security & Logic", () => {
    it("should reject non-numeric quantities", async () => {
        const request = {
            json: async () => ({
                exchange: "bitunix",
                apiKey: "valid-mock-api-key-12345",
                apiSecret: "valid-mock-api-secret-12345",
                type: "place-order",
                symbol: "BTCUSDT",
                side: "BUY",
                qty: "10abc", // Malicious/Bad input
                price: "50000"
            })
        } as any;

        const response = await POST({ request } as any);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain("Invalid quantity format");
    });

    it("should accept valid order with correct orderType", async () => {
         // Mock fetch to simulate Bitunix success
         global.fetch = vi.fn().mockResolvedValue({
             ok: true,
             json: async () => ({ code: "0", data: { orderId: "123" } }),
             text: async () => ""
         });

         const request = {
            json: async () => ({
                exchange: "bitunix",
                apiKey: "valid-mock-api-key-12345",
                apiSecret: "valid-mock-api-secret-12345",
                type: "place-order",
                orderType: "LIMIT", // Correct field now
                symbol: "BTCUSDT",
                side: "BUY",
                qty: "10",
                price: "50000"
            })
        } as any;

        const response = await POST({ request } as any);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.orders).toBeUndefined(); // It returns object directly or wrapped?
        // POST returns json(result). result = res.data (BitunixOrder).
        expect(data.orderId).toBe("123");
    });
});
