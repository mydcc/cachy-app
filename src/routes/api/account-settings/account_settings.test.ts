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

/*
 * FEAT-0068 — the account-settings write route.
 *
 * Two things are worth a test here, and they are not the happy path's
 * plumbing. First: each action reaches its documented Bitunix endpoint with
 * its documented body (docs/bitunix-api/02_account.md) — BUG-0001 is the
 * standing reminder of what a wrong path or field name costs. Second: a
 * failure never comes back looking like a success, because a settings write
 * that silently did nothing leaves a trader sizing against a leverage the
 * exchange never accepted.
 */

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

const creds = { apiKey: "validApiKey123", apiSecret: "validSecret123456" };

function call(body: unknown) {
  return POST({
    request: makeRequest(body),
    getClientAddress,
  } as unknown as Parameters<typeof POST>[0]);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(clientToken, "checkClientToken").mockReturnValue(null);
  fetchMock.mockResolvedValue({
    ok: true,
    text: async () => JSON.stringify({ code: 0, data: [], msg: "Success" }),
  });
});

/** The upstream request the route produced, path and parsed body. */
function sentRequest(): { url: string; body: Record<string, unknown> } {
  const [url, init] = fetchMock.mock.calls[0];
  return { url: String(url), body: JSON.parse(String((init as RequestInit).body)) };
}

describe("POST /api/account-settings reaches the documented endpoints", () => {
  it("change-leverage -> change_leverage with symbol, marginCoin and an int", async () => {
    const response = await call({
      exchange: "bitunix",
      type: "change-leverage",
      symbol: "BTCUSDT",
      leverage: 12,
      ...creds,
    });

    expect(response.status).toBe(200);
    const { url, body } = sentRequest();
    expect(url).toBe("https://fapi.bitunix.com/api/v1/futures/account/change_leverage");
    expect(body).toEqual({ symbol: "BTCUSDT", marginCoin: "USDT", leverage: 12 });
  });

  it("change-margin-mode -> change_margin_mode with the venue's own spelling", async () => {
    await call({
      exchange: "bitunix",
      type: "change-margin-mode",
      symbol: "BTCUSDT",
      marginMode: "ISOLATION",
      ...creds,
    });

    const { url, body } = sentRequest();
    expect(url).toBe("https://fapi.bitunix.com/api/v1/futures/account/change_margin_mode");
    expect(body).toEqual({ symbol: "BTCUSDT", marginCoin: "USDT", marginMode: "ISOLATION" });
  });

  it("change-position-mode -> change_position_mode, and sends no symbol", async () => {
    await call({
      exchange: "bitunix",
      type: "change-position-mode",
      positionMode: "HEDGE",
      ...creds,
    });

    const { url, body } = sentRequest();
    expect(url).toBe("https://fapi.bitunix.com/api/v1/futures/account/change_position_mode");
    // The endpoint is account-wide; a symbol here would be a field the
    // exchange does not document and Cachy would be guessing.
    expect(body).toEqual({ positionMode: "HEDGE" });
  });

  it("adjust-position-margin keeps the sign that says add or withdraw", async () => {
    await call({
      exchange: "bitunix",
      type: "adjust-position-margin",
      symbol: "BTCUSDT",
      amount: "-100",
      side: "LONG",
      ...creds,
    });

    const { url, body } = sentRequest();
    expect(url).toBe("https://fapi.bitunix.com/api/v1/futures/account/adjust_position_margin");
    expect(body).toEqual({
      symbol: "BTCUSDT",
      marginCoin: "USDT",
      amount: "-100",
      side: "LONG",
    });
  });

  it("sends a small margin amount in full decimal notation, never as 1e-7", async () => {
    await call({
      exchange: "bitunix",
      type: "adjust-position-margin",
      symbol: "PEPEUSDT",
      amount: 0.0000001,
      positionId: "42",
      ...creds,
    });

    // Exchanges reject scientific notation, which `Decimal.toString()` emits
    // from this exponent down.
    expect(sentRequest().body.amount).toBe("0.0000001");
  });
});

describe("POST /api/account-settings refuses rather than reporting a silent success", () => {
  it("rejects an unaddressed margin adjustment", async () => {
    // Neither side nor positionId: in hedge mode the exchange would be left
    // to pick a position, which could be the opposite one.
    const response = await call({
      exchange: "bitunix",
      type: "adjust-position-margin",
      symbol: "BTCUSDT",
      amount: "10",
      ...creds,
    });

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a zero margin adjustment before it travels", async () => {
    const response = await call({
      exchange: "bitunix",
      type: "adjust-position-margin",
      symbol: "BTCUSDT",
      amount: "0",
      side: "LONG",
      ...creds,
    });

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown action", async () => {
    const response = await call({
      exchange: "bitunix",
      type: "change-everything",
      ...creds,
    });

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("turns the exchange's own precondition refusal into an error", async () => {
    // What Bitunix answers for "cannot change margin mode with an open
    // position": HTTP 200, code != 0. Read as success it would tell the
    // trader their margin mode had changed.
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({ code: 10001, data: null, msg: "Position or order exists" }),
    });

    const response = await call({
      exchange: "bitunix",
      type: "change-margin-mode",
      symbol: "BTCUSDT",
      marginMode: "CROSS",
      ...creds,
    });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toContain("Position or order exists");
  });

  it("refuses a venue that has no verified format for this family", async () => {
    const response = await call({
      exchange: "bitget",
      type: "change-leverage",
      symbol: "BTCUSDT",
      leverage: 10,
      apiKey: "validApiKey123",
      apiSecret: "validSecret123456",
      passphrase: "phrase",
    });

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("UNSUPPORTED_EXCHANGE");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never lets the API secret out in an upstream error message", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => `bad signature for key ${creds.apiKey}`,
    });

    const response = await call({
      exchange: "bitunix",
      type: "change-leverage",
      symbol: "BTCUSDT",
      leverage: 10,
      ...creds,
    });

    const body = await response.json();
    expect(body.error).not.toContain(creds.apiKey);
    expect(body.error).toContain("***");
  });

  it("requires credentials", async () => {
    const response = await call({
      exchange: "bitunix",
      type: "change-leverage",
      symbol: "BTCUSDT",
      leverage: 10,
    });

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
