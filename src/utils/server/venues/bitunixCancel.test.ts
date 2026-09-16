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

/**
 * Venue-level coverage for the Bitunix cancel family (PR #3421 review).
 *
 * `cancelBitunixOrder` and `cancelAllBitunixOrders` are module-private, so
 * they are exercised through `bitunixVenue.executeOrder` with a stubbed
 * global `fetch` — the same seam the order-route tests use. The cases pin
 * the three behaviours a cancel must never get wrong with real money behind
 * it: success returns the venue data, a per-order `failureList` entry
 * surfaces as an error rather than a silent success, and a 400/404 on a
 * single cancel resolves quietly (the order is already gone).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderRequestPayload } from "../../../types/orderSchemas";
import { bitunixVenue } from "./bitunix";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const CREDS = { apiKey: "validApiKey123", apiSecret: "validSecret123456" };

const cancelOrder = (extra: Record<string, unknown> = {}) =>
  ({
    exchange: "bitunix",
    type: "cancel-order",
    symbol: "BTCUSDT",
    orderId: "42",
    ...extra,
  }) as unknown as OrderRequestPayload;

const cancelAll = (extra: Record<string, unknown> = {}) =>
  ({
    exchange: "bitunix",
    type: "cancel-all",
    symbol: "BTCUSDT",
    ...extra,
  }) as unknown as OrderRequestPayload;

function okResponse(body: unknown) {
  return { ok: true, status: 200, text: async () => JSON.stringify(body) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("bitunixVenue.executeOrder cancel-order", () => {
  it("posts to cancel_orders with an orderList and returns the venue data", async () => {
    fetchMock.mockResolvedValue(
      okResponse({ code: 0, data: { successList: [{ orderId: "42" }], failureList: [] }, msg: "Success" }),
    );

    const result = await bitunixVenue.executeOrder(CREDS, cancelOrder());

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/futures/trade/cancel_orders");
    expect(JSON.parse(String(init.body))).toEqual({ symbol: "BTCUSDT", orderList: [{ orderId: "42" }] });
    expect(result).toEqual({ successList: [{ orderId: "42" }], failureList: [] });
  });

  it("resolves quietly on 400/404 — the order is already filled or cancelled", async () => {
    for (const status of [400, 404]) {
      fetchMock.mockResolvedValue({ ok: false, status, text: async () => "gone" });

      await expect(bitunixVenue.executeOrder(CREDS, cancelOrder())).resolves.toBeUndefined();
    }
  });

  it("surfaces a per-order failureList entry as an error, not a silent success", async () => {
    fetchMock.mockResolvedValue(
      okResponse({ code: 0, data: { failureList: [{ orderId: "42", errorCode: "101", errorMsg: "filled" }] }, msg: "Success" }),
    );

    await expect(bitunixVenue.executeOrder(CREDS, cancelOrder())).rejects.toThrow("filled");
  });

  it("throws on a non-zero venue code", async () => {
    fetchMock.mockResolvedValue(okResponse({ code: "20001", data: null, msg: "auth failed" }));

    await expect(bitunixVenue.executeOrder(CREDS, cancelOrder())).rejects.toThrow("auth failed");
  });
});

describe("bitunixVenue.executeOrder cancel-all", () => {
  it("posts to cancel_all_orders and returns the venue data", async () => {
    fetchMock.mockResolvedValue(okResponse({ code: "0", data: { success: true }, msg: "Success" }));

    const result = await bitunixVenue.executeOrder(CREDS, cancelAll());

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/futures/trade/cancel_all_orders");
    expect(JSON.parse(String(init.body))).toEqual({ symbol: "BTCUSDT" });
    expect(result).toEqual({ success: true });
  });

  it("throws on transport failure instead of resolving quietly", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => "boom" });

    await expect(bitunixVenue.executeOrder(CREDS, cancelAll())).rejects.toThrow("Cancel all failed");
  });

  it("surfaces a partial failureList entry as an error", async () => {
    fetchMock.mockResolvedValue(
      okResponse({ code: "0", data: { failureList: [{ errorCode: "9", errorMsg: "busy" }] }, msg: "ok" }),
    );

    await expect(bitunixVenue.executeOrder(CREDS, cancelAll())).rejects.toThrow("busy");
  });
});
