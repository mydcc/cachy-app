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

// Regression: Bitunix's get_history_orders excludes CANCELED orders unless
// queryCanceled=true is passed — and then excludes everything else (see
// docs/bitunix-api/07_trade.md). The route used to never forward this
// param, so cancelled orders (extremely common while testing/trading)
// silently never appeared in History.

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
  fetchMock.mockResolvedValue({
    ok: true,
    text: async () => JSON.stringify({ code: 0, data: { orderList: [] }, msg: "Success" }),
  });
});

describe("POST /api/orders history forwards queryCanceled", () => {
  it("omits queryCanceled from the query string by default", async () => {
    await POST({
      request: makeRequest({
        exchange: "bitunix",
        type: "history",
        apiKey: "validApiKey123",
        apiSecret: "validSecret123456",
      }),
      getClientAddress,
    } as unknown as Parameters<typeof POST>[0]);

    const [url] = fetchMock.mock.calls[0];
    expect(url).not.toContain("queryCanceled");
  });

  it("adds queryCanceled=true to the query string when requested", async () => {
    await POST({
      request: makeRequest({
        exchange: "bitunix",
        type: "history",
        queryCanceled: true,
        apiKey: "validApiKey123",
        apiSecret: "validSecret123456",
      }),
      getClientAddress,
    } as unknown as Parameters<typeof POST>[0]);

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("queryCanceled=true");
  });
});
