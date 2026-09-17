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
 *
 * FEAT-0405 A5 added a third: the route forwards the client's envelope and
 * never a secret. The requests below are built by `signedEnvelopeRequest`, which
 * runs the browser's own signer, so a handler that rejects them is a real
 * disagreement about the bytes rather than a stale fixture.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./+server";
import * as clientToken from "../../../lib/server/clientToken";
import { logger } from "../../../lib/server/logger";
import { AccountSettingsRequestSchema } from "../../../types/accountSettingsSchemas";
import {
    TEST_SIGNING_KEYS,
    signedEnvelopeRequest,
} from "../../../tests/helpers/signedEnvelopeRequest";
import type { Venue } from "../../../utils/exchange/restSigningPlan";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const getClientAddress = () => "127.0.0.1";

function makeRequest(body: unknown): Request {
  return {
    text: async () => JSON.stringify(body),
    headers: new Headers(),
  } as unknown as Request;
}

function dispatch(request: Request) {
  return POST({ request, getClientAddress } as unknown as Parameters<typeof POST>[0]);
}

/**
 * The request the *client* builds, parsed and then signed.
 *
 * `AccountSettingsRequestSchema` is applied here because the client applies it
 * before signing (`tradeService.accountSettingRequest`): `marginCoin` carries a
 * default and `amount` a transform, so a payload signed unparsed is a payload
 * this route rebuilds differently. `parse: false` is for the cases the client
 * could never send — the schema itself rejects them — where what is under test
 * is the route's own refusal.
 */
async function signedCall(
  payload: Record<string, unknown>,
  { venue = "bitunix" as Venue, parse = true } = {},
) {
  const { request } = await signedEnvelopeRequest(
    "/api/account-settings",
    parse ? AccountSettingsRequestSchema.parse(payload) : payload,
    {},
    venue,
  );
  return dispatch(request);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(clientToken, "checkClientToken").mockReturnValue(null);
  fetchMock.mockResolvedValue({
    ok: true,
    text: async () => JSON.stringify({ code: 0, data: [], msg: "Success" }),
  });
});

/** The upstream request the route produced, path, headers and parsed body. */
function sentRequest(): {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
} {
  const [url, init] = fetchMock.mock.calls[0];
  const requestInit = init as RequestInit;
  return {
    url: String(url),
    headers: requestInit.headers as Record<string, string>,
    body: JSON.parse(String(requestInit.body)),
  };
}

/**
 * A request the app cannot produce: a valid envelope over a body that did not
 * yield it.
 *
 * The three cases that use this are refused by `buildVenueBody` *before* the
 * client signs — so from the app they are unreachable, and the route's own
 * refusal is the only place they are observable. What is under test is that the
 * route still answers 400 rather than forwarding them, which is what keeps a
 * hand-rolled client from reaching Bitunix with an unchecked body.
 */
async function forgedRequest(body: Record<string, unknown>): Promise<Request> {
  const { request } = await signedEnvelopeRequest(
    "/api/account-settings",
    AccountSettingsRequestSchema.parse({
      exchange: "bitunix",
      type: "change-leverage",
      symbol: "BTCUSDT",
      leverage: 5,
    }),
    {},
    "bitunix",
  );
  return new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/account-settings reaches the documented endpoints", () => {
  it("change-leverage -> change_leverage with symbol, marginCoin and an int", async () => {
    const response = await signedCall({
      exchange: "bitunix",
      type: "change-leverage",
      symbol: "BTCUSDT",
      leverage: 12,
    });

    expect(response.status).toBe(200);
    const { url, body } = sentRequest();
    expect(url).toBe("https://fapi.bitunix.com/api/v1/futures/account/change_leverage");
    expect(body).toEqual({ symbol: "BTCUSDT", marginCoin: "USDT", leverage: 12 });
  });

  it("forwards the client's envelope, and no secret with it", async () => {
    await signedCall({
      exchange: "bitunix",
      type: "change-leverage",
      symbol: "BTCUSDT",
      leverage: 12,
    });

    const { headers } = sentRequest();
    // The key is the only credential the venue is given, and the signature is
    // the client's — this process cannot produce one, which is the whole point.
    expect(headers["api-key"]).toBe(TEST_SIGNING_KEYS.apiKey);
    expect(headers.sign).toEqual(expect.any(String));
    expect(headers.nonce).toEqual(expect.any(String));
    expect(headers.timestamp).toEqual(expect.any(String));
    expect(JSON.stringify(headers)).not.toContain(TEST_SIGNING_KEYS.apiSecret);
  });

  it("change-margin-mode -> change_margin_mode with the venue's own spelling", async () => {
    await signedCall({
      exchange: "bitunix",
      type: "change-margin-mode",
      symbol: "BTCUSDT",
      marginMode: "ISOLATION",
    });

    const { url, body } = sentRequest();
    expect(url).toBe("https://fapi.bitunix.com/api/v1/futures/account/change_margin_mode");
    expect(body).toEqual({ symbol: "BTCUSDT", marginCoin: "USDT", marginMode: "ISOLATION" });
  });

  it("change-position-mode -> change_position_mode, and sends no symbol", async () => {
    await signedCall({
      exchange: "bitunix",
      type: "change-position-mode",
      positionMode: "HEDGE",
    });

    const { url, body } = sentRequest();
    expect(url).toBe("https://fapi.bitunix.com/api/v1/futures/account/change_position_mode");
    // The endpoint is account-wide; a symbol here would be a field the
    // exchange does not document and Cachy would be guessing.
    expect(body).toEqual({ positionMode: "HEDGE" });
  });

  it("adjust-position-margin keeps the sign that says add or withdraw", async () => {
    await signedCall({
      exchange: "bitunix",
      type: "adjust-position-margin",
      symbol: "BTCUSDT",
      amount: "-100",
      side: "LONG",
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
    await signedCall({
      exchange: "bitunix",
      type: "adjust-position-margin",
      symbol: "PEPEUSDT",
      amount: 0.0000001,
      positionId: "42",
    });

    // Exchanges reject scientific notation, which `Decimal.toString()` emits
    // from this exponent down. The transform in the schema normalises it, which
    // is also why the client has to sign the *parsed* payload: an unparsed
    // `0.0000001` and this route's rebuild are two different strings.
    expect(sentRequest().body.amount).toBe("0.0000001");
  });
});

describe("POST /api/account-settings refuses rather than reporting a silent success", () => {
  it("refuses a payload that was signed before it was parsed", async () => {
    // The failure this route exists to catch, and the reason the client parses
    // first: `marginCoin` is absent from the raw payload, so the signature
    // covers a body this route cannot rebuild. It has to be a divergence
    // refusal, not a venue rejection.
    const response = await signedCall(
      { exchange: "bitunix", type: "change-leverage", symbol: "BTCUSDT", leverage: 12 },
      { parse: false },
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("PRESIGNED_DIVERGENCE");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still refuses an unaddressed margin adjustment", async () => {
    // `buildVenueBody` throws for this pair: the exchange cannot tell which
    // position to move margin on, and in hedge mode the wrong guess moves it on
    // the opposite side. The route rebuilds through that same builder, so it
    // keeps the refusal for a request that arrives without one.
    const response = await dispatch(
      await forgedRequest({
        exchange: "bitunix",
        type: "adjust-position-margin",
        symbol: "BTCUSDT",
        amount: "10",
        venueBody: "{}",
      }),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a zero margin adjustment", async () => {
    const response = await signedCall(
      {
        exchange: "bitunix",
        type: "adjust-position-margin",
        symbol: "BTCUSDT",
        amount: "0",
        side: "LONG",
      },
      { parse: false },
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown action", async () => {
    const response = await dispatch(
      await forgedRequest({ exchange: "bitunix", type: "change-everything", venueBody: "{}" }),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a body with no signed bytes to compare against", async () => {
    const response = await dispatch(
      makeRequest({
        exchange: "bitunix",
        type: "change-leverage",
        symbol: "BTCUSDT",
        leverage: 10,
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("MISSING_SIGNED_BODY");
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

    const response = await signedCall({
      exchange: "bitunix",
      type: "change-margin-mode",
      symbol: "BTCUSDT",
      marginMode: "CROSS",
    });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toContain("Position or order exists");
  });

  it("refuses an envelope built for a venue this route does not serve", async () => {
    // Bitget wires none of this family, so the plan row names Bitunix alone —
    // which means the client cannot even sign a Bitget envelope for this path.
    await expect(
      signedEnvelopeRequest(
        "/api/account-settings",
        AccountSettingsRequestSchema.parse({
          exchange: "bitget",
          type: "change-leverage",
          symbol: "BTCUSDT",
          leverage: 10,
        }),
        {},
        "bitget",
      ),
    ).rejects.toThrow();

    // And a body that still claims another venue is refused here rather than
    // forwarded with a Bitunix envelope the client built from other keys.
    const response = await signedCall(
      {
        exchange: "bitget",
        type: "change-leverage",
        symbol: "BTCUSDT",
        leverage: 10,
      },
      { parse: false },
    );

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("UNSUPPORTED_EXCHANGE");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never lets the API key out in an upstream error message", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => `bad signature for key ${TEST_SIGNING_KEYS.apiKey}`,
    });

    const response = await signedCall({
      exchange: "bitunix",
      type: "change-leverage",
      symbol: "BTCUSDT",
      leverage: 10,
    });

    const body = await response.json();
    expect(body.error).not.toContain(TEST_SIGNING_KEYS.apiKey);
    expect(body.error).toContain("***");
  });

  it("scrubs the key from the log line too, not only from the answer", async () => {
    // The venue echoes the key back inside its error text, and the same
    // sanitised string has to reach both the client and the log — a key left in
    // a log file is the same leak with a much longer half-life.
    const loggerSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => `bad signature for key ${TEST_SIGNING_KEYS.apiKey}`,
    });

    await signedCall({
      exchange: "bitunix",
      type: "change-leverage",
      symbol: "BTCUSDT",
      leverage: 10,
    });

    expect(loggerSpy).toHaveBeenCalled();
    expect(JSON.stringify(loggerSpy.mock.calls)).not.toContain(TEST_SIGNING_KEYS.apiKey);
    expect(JSON.stringify(loggerSpy.mock.calls)).toContain("***");
  });

  it("requires an envelope", async () => {
    const response = await dispatch(
      makeRequest({
        exchange: "bitunix",
        type: "change-leverage",
        symbol: "BTCUSDT",
        leverage: 10,
        venueBody: "{}",
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("PRESIGNED_ENVELOPE_MISSING");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
