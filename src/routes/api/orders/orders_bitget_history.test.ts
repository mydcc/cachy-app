// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./+server";
import * as clientToken from "../../../lib/server/clientToken";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const getClientAddress = () => "127.0.0.1";

function makeRequest(body: unknown): Request {
  return {
    text: async () => JSON.stringify(body),
    headers: new Headers(),
  } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(clientToken, "checkClientToken").mockReturnValue(null);
});

describe("Bitget History Error Handling", () => {
    it("throws an error on non-ok response instead of silently returning empty list", async () => {
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 401,
            text: async () => "Unauthorized"
        });

        const res = await POST({
            request: makeRequest({
                exchange: "bitget",
                type: "history",
                limit: 10,
                apiKey: "validApiKey123",
                apiSecret: "validSecret123456",
                passphrase: "validPassphrase123"
            }),
            getClientAddress,
        } as unknown as Parameters<typeof POST>[0]);

        const data = await res.json();

        // Ensure error is returned (caught in outer try-catch)
        expect(res.status).toBe(500);
        expect(data).toHaveProperty("error");
        expect(data.error).toBe("bitunixErrors.BITGET_API_ERROR"); // Yes, the constant is bitunixErrors.BITGET_API_ERROR
        expect(data.orders).toBeUndefined();
    });

    it("throws an error on bitget protocol error code instead of silently returning empty list", async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ code: "40001", msg: "Invalid Request", data: null })
        });

        const res = await POST({
            request: makeRequest({
                exchange: "bitget",
                type: "history",
                limit: 10,
                apiKey: "validApiKey123",
                apiSecret: "validSecret123456",
                passphrase: "validPassphrase123"
            }),
            getClientAddress,
        } as unknown as Parameters<typeof POST>[0]);

        const data = await res.json();

        expect(res.status).toBe(500);
        expect(data).toHaveProperty("error");
        expect(data.error).toBe("Bitget Error: Invalid Request");
        expect(data.orders).toBeUndefined();
    });

    it("still returns empty list for successful empty history", async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ code: "00000", msg: "success", data: [] })
        });

        const res = await POST({
            request: makeRequest({
                exchange: "bitget",
                type: "history",
                limit: 10,
                apiKey: "validApiKey123",
                apiSecret: "validSecret123456",
                passphrase: "validPassphrase123"
            }),
            getClientAddress,
        } as unknown as Parameters<typeof POST>[0]);

        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data).not.toHaveProperty("error");
        expect(data.orders).toEqual([]);
    });
});
