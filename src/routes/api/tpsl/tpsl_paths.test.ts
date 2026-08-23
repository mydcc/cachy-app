/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./+server";
import * as clientToken from "../../../lib/server/clientToken";

// Regression test for the wrong Bitunix TP/SL paths (tp_sl/*_tp_sl_order
// instead of tpsl/*_order(s)) that made every TP/SL request 404/error at
// Bitunix regardless of the client-token or signature being correct. See
// docs/bitunix-api/06_tp_sl.md for the endpoints these must match.

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const getClientAddress = () => "127.0.0.1";

function makeRequest(body: unknown): Request {
  return {
    text: async () => JSON.stringify(body),
    headers: new Headers(),
  } as unknown as Request;
}

const creds = { apiKey: "validApiKey123", apiSecret: "validSecret123456" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(clientToken, "checkClientToken").mockReturnValue(null);
  fetchMock.mockResolvedValue({
    ok: true,
    text: async () => JSON.stringify({ code: 0, data: [], msg: "Success" }),
  });
});

describe("POST /api/tpsl uses the real Bitunix endpoints", () => {
  it("pending -> GET /api/v1/futures/tpsl/get_pending_orders", async () => {
    const response = await POST({
      request: makeRequest({ exchange: "bitunix", action: "pending", params: {}, ...creds }),
      getClientAddress,
    } as unknown as Parameters<typeof POST>[0]);

    expect(response.status).toBe(200);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("https://fapi.bitunix.com/api/v1/futures/tpsl/get_pending_orders");
  });

  it("history -> GET /api/v1/futures/tpsl/get_history_orders", async () => {
    const response = await POST({
      request: makeRequest({ exchange: "bitunix", action: "history", params: {}, ...creds }),
      getClientAddress,
    } as unknown as Parameters<typeof POST>[0]);

    expect(response.status).toBe(200);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("https://fapi.bitunix.com/api/v1/futures/tpsl/get_history_orders");
  });

  it("cancel -> POST /api/v1/futures/tpsl/cancel_order", async () => {
    const response = await POST({
      request: makeRequest({
        exchange: "bitunix",
        action: "cancel",
        params: { orderId: "1", symbol: "BTCUSDT" },
        ...creds,
      }),
      getClientAddress,
    } as unknown as Parameters<typeof POST>[0]);

    expect(response.status).toBe(200);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://fapi.bitunix.com/api/v1/futures/tpsl/cancel_order");
    expect(options.method).toBe("POST");
  });

  it("modify -> POST /api/v1/futures/tpsl/modify_order", async () => {
    const response = await POST({
      request: makeRequest({
        exchange: "bitunix",
        action: "modify",
        params: { orderId: "1", tpPrice: "50000", tpStopType: "MARK_PRICE" },
        ...creds,
      }),
      getClientAddress,
    } as unknown as Parameters<typeof POST>[0]);

    expect(response.status).toBe(200);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://fapi.bitunix.com/api/v1/futures/tpsl/modify_order");
    expect(options.method).toBe("POST");
  });
});
