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
import { createHash } from "node:crypto";
import { POST } from "./+server";
import * as clientToken from "../../../lib/server/clientToken";
import {
  signedEnvelopeRequest,
  TEST_SIGNING_KEYS,
} from "../../../tests/helpers/signedEnvelopeRequest";

// Regression test: order cancellation used to call the singular, DELETE-only
// /trade/cancel_order, which Bitunix does not expose (see
// docs/bitunix-api/07_trade.md "Cancel Orders" — POST, plural, orderList).

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const getClientAddress = () => "127.0.0.1";

/** The envelope `exchangeSignedFetch` would send for a Bitunix cancel. */
async function cancelOrderRequest() {
  return signedEnvelopeRequest(
    "/api/orders?action=cancel-order",
    { exchange: "bitunix", type: "cancel-order", symbol: "BTCUSDT", orderId: "42" },
    {},
    "bitunix",
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(clientToken, "checkClientToken").mockReturnValue(null);
});

describe("POST /api/orders cancel-order uses the real Bitunix endpoint", () => {
  it("calls POST /api/v1/futures/trade/cancel_orders with an orderList", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({ code: 0, data: { successList: [{ orderId: "42" }], failureList: [] }, msg: "Success" }),
    });

    const { request, url } = await cancelOrderRequest();
    const response = await POST({
      request,
      url,
      getClientAddress,
    } as unknown as Parameters<typeof POST>[0]);

    expect(response.status).toBe(200);
    const [forwardedUrl, options] = fetchMock.mock.calls[0];
    expect(forwardedUrl).toBe("https://fapi.bitunix.com/api/v1/futures/trade/cancel_orders");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({
      symbol: "BTCUSDT",
      orderList: [{ orderId: "42" }],
    });
    // Conformance: the signature covers the posted body bytes (body-signed),
    // not a query string. Bitunix documents `cancel_orders` as a POST whose
    // parameters ride in the body (`docs/bitunix-api/07_trade.md`), so the
    // signature input is `nonce + timestamp + apiKey + "" + body` — recomputed
    // here from the exact bytes that went out, which also pins their order.
    //
    // FEAT-0405 A5: the *client* produced that signature, and the route
    // forwards it rather than computing its own. Recomputing it here from the
    // bytes that actually left is still the assertion that matters — the bytes
    // the venue verifies are the bytes the client signed.
    const sentBody = options.body as string;
    const digest = createHash("sha256")
      .update(
        `${options.headers.nonce}${options.headers.timestamp}${TEST_SIGNING_KEYS.apiKey}${sentBody}`,
      )
      .digest("hex");
    expect(options.headers.sign).toBe(
      createHash("sha256").update(digest + TEST_SIGNING_KEYS.apiSecret).digest("hex"),
    );
  });

  it("surfaces a rejected order from failureList as an error", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          code: 0,
          data: { successList: [], failureList: [{ orderId: "42", errorMsg: "Order status error", errorCode: 10013 }] },
          msg: "Success",
        }),
    });

    const { request, url } = await cancelOrderRequest();
    const response = await POST({
      request,
      url,
      getClientAddress,
    } as unknown as Parameters<typeof POST>[0]);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Order status error");
  });
});
