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
 * BUG-0597 Phase E — the modify dispatch.
 *
 * The body matrix lives in `bitgetUtaModify.test.ts`; this pins the two
 * things the matrix cannot: the venue sends to the UTA modify path (not a
 * leftover V1 row), and the venue answers refusals the same way every other
 * signed call does (envelope first, via the shared assert).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { bitgetVenue } from "./bitget";
import type { PresignedEnvelope } from "../presignedEnvelope";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const envelope: PresignedEnvelope = {
  apiKey: "test-key",
  signature: "test-signature",
  timestamp: "1791099421047",
  passphrase: "test-passphrase",
};

function requestedUrl(call = 0): URL {
  return new URL(fetchMock.mock.calls[call][0] as string);
}

describe("Bitget UTA modify dispatch (BUG-0597 Phase E)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("posts modifications to the UTA modify path", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          code: "00000",
          msg: "success",
          data: { orderId: "1" },
        }),
    });

    await bitgetVenue.executeOrder(
      envelope,
      { exchange: "bitget", type: "modify-order" } as never,
      JSON.stringify({
        orderId: "1",
        symbol: "BTCUSDT",
        category: "USDT-FUTURES",
        price: "89000",
      }),
    );

    expect(requestedUrl().pathname).toBe("/api/v3/trade/modify-order");
  });

  it("surfaces a venue refusal with the venue code attached", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({ code: "40001", msg: "Invalid Request", data: null }),
    });

    const error = await bitgetVenue
      .executeOrder(
        envelope,
        { exchange: "bitget", type: "modify-order" } as never,
        "{}",
      )
      .then(
        () => null,
        (e) => e as { venueCode?: string },
      );

    expect(error?.venueCode).toBe("40001");
  });
});
