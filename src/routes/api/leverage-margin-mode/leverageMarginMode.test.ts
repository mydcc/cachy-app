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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as leverageMarginMode } from "./+server";
import * as clientToken from "../../../lib/server/clientToken";
import { signedEnvelopeRequest } from "../../../tests/helpers/signedEnvelopeRequest";
import { buildLeverageMarginModeQueryParams } from "../../../utils/exchange/venueQueries";

/**
 * BUG-0515 — the proxy mapped the venue's leverage with a bare `Number()`,
 * so `null` became `0x` and garbage became `NaN` (serialised as `null`)
 * before anything validated it. The client re-validates, but the proxy
 * must fail closed at the source instead of forwarding a value no venue
 * would ever send.
 *
 * The venue answers with an int and the UI only displays/compares it
 * (BUG-0433), so integers — including stringified ones — keep passing;
 * only the unrepresentable shapes are rejected.
 */
type RouteHandler = (event: {
  request: Request;
  getClientAddress: () => string;
}) => Promise<Response>;

const getClientAddress = () => "127.0.0.1";
const fetchMock = vi.fn();

function venueReply(data: unknown) {
  fetchMock.mockResolvedValue({
    ok: true,
    text: async () => JSON.stringify({ code: 0, data }),
  });
}

async function postLeverage() {
  const { request } = await signedEnvelopeRequest(
    "/api/leverage-margin-mode",
    { exchange: "bitunix", symbol: "BTCUSDT" },
    buildLeverageMarginModeQueryParams({ symbol: "BTCUSDT" }),
  );
  return (leverageMarginMode as unknown as RouteHandler)({
    request,
    getClientAddress,
  });
}

describe("leverage-margin-mode venue payload validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(clientToken, "checkClientToken").mockReturnValue(null);
    venueReply({
      symbol: "BTCUSDT",
      marginCoin: "USDT",
      leverage: 10,
      marginMode: "cross",
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("passes a venue integer leverage through", async () => {
    const response = await postLeverage();

    expect(response.status).toBe(200);
    expect((await response.json()).data.leverage).toBe(10);
  });

  it("coerces a stringified integer leverage", async () => {
    venueReply({
      symbol: "BTCUSDT",
      marginCoin: "USDT",
      leverage: "10",
      marginMode: "cross",
    });

    const response = await postLeverage();

    expect(response.status).toBe(200);
    expect((await response.json()).data.leverage).toBe(10);
  });

  it("rejects null leverage instead of coercing it to 0x", async () => {
    venueReply({
      symbol: "BTCUSDT",
      marginCoin: "USDT",
      leverage: null,
      marginMode: "cross",
    });

    const response = await postLeverage();

    expect(response.status).not.toBe(200);
  });

  it("rejects non-numeric leverage instead of forwarding NaN", async () => {
    venueReply({
      symbol: "BTCUSDT",
      marginCoin: "USDT",
      leverage: "abc",
      marginMode: "cross",
    });

    const response = await postLeverage();

    expect(response.status).not.toBe(200);
  });
});
