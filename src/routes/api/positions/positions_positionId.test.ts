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
import { signedEnvelopeRequest } from "../../../tests/helpers/signedEnvelopeRequest";
import { buildPositionsQueryParams } from "../../../utils/exchange/venueQueries";

// Regression: the Bitunix "Get Pending Positions" response includes
// positionId (docs/bitunix-api/05_position.md), but the normalizer dropped
// it. Without it, the client can't correlate a REST-hydrated position with
// subsequent WS position-channel updates (which match by positionId), so
// every WS push after a REST refresh created a duplicate instead of
// updating the existing entry.

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const getClientAddress = () => "127.0.0.1";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(clientToken, "checkClientToken").mockReturnValue(null);
});

describe("POST /api/positions includes positionId in the normalized response", () => {
  it("passes Bitunix's positionId through", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          code: 0,
          data: [
            {
              positionId: "12345678",
              symbol: "BTCUSDT",
              side: "LONG",
              qty: "0.5",
              avgOpenPrice: "60000",
              marginMode: "ISOLATION",
            },
          ],
          msg: "Success",
        }),
    });

    const { request } = await signedEnvelopeRequest(
      "/api/positions",
      { exchange: "bitunix" },
      buildPositionsQueryParams("bitunix"),
      "bitunix",
    );

    const response = await POST({
      request,
      getClientAddress,
    } as unknown as Parameters<typeof POST>[0]);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.positions).toHaveLength(1);
    expect(body.data.positions[0].positionId).toBe("12345678");
  });
});
