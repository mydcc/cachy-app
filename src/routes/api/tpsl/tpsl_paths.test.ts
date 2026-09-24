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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./+server";
import * as clientToken from "../../../lib/server/clientToken";
import {
  signedEnvelopeRequest,
  TEST_SIGNING_KEYS,
} from "../../../tests/helpers/signedEnvelopeRequest";
import { buildTpslReadQueryParams, buildTpslWriteBody } from "../../../utils/exchange/venueQueries";

// Regression test for the wrong Bitunix TP/SL paths (tp_sl/*_tp_sl_order
// instead of tpsl/*_order(s)) that made every TP/SL request 404/error at
// Bitunix regardless of the client-token or signature being correct. See
// docs/bitunix-api/06_tp_sl.md for the endpoints these must match.

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const getClientAddress = () => "127.0.0.1";

const handler = ({ request, url }: { request: Request; url: URL }) =>
  POST({ request, url, getClientAddress } as unknown as Parameters<typeof POST>[0]);

/**
 * FEAT-0405 — `/api/tpsl` is the one route whose signature shape is a property
 * of the action, not of the route: the two readers sign a query, the four
 * writers sign a body. The action therefore rides in the URL, which is where
 * the handler learns which of the two it is looking at.
 */
const WRITE_ACTIONS = new Set(["cancel", "modify", "place", "place-position"]);

function callAction(action: string, params: Record<string, unknown>) {
  const writes = WRITE_ACTIONS.has(action);
  // A writer's Cachy body *is* the venue body: the route forwards the signed
  // bytes unchanged, so the `{ exchange, action, params }` wrapper the callers
  // build is transport only and never travels. It travels already serialised,
  // by the same builder the route rebuilds it with — because the signer builds
  // a venue body only from a *Cachy* payload and takes a string verbatim.
  // A reader still sends the wrapper, which is what its schema validates.
  const payload = writes
    ? buildTpslWriteBody(params)
    : { exchange: "bitunix", action, params };

  // A writer signs its body and sends no query at all, so it must sign an
  // empty one: signing a query the venue never receives is a signature the
  // venue cannot reproduce.
  return signedEnvelopeRequest(
    `/api/tpsl?action=${action}`,
    payload,
    writes ? {} : buildTpslReadQueryParams(params),
  ).then(handler);
}

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
    const response = await callAction("pending", {});

    expect(response.status).toBe(200);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("https://fapi.bitunix.com/api/v1/futures/tpsl/get_pending_orders");
    expect(options.method).toBe("GET");
  });

  it("history -> GET /api/v1/futures/tpsl/get_history_orders", async () => {
    const response = await callAction("history", {});

    expect(response.status).toBe(200);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("https://fapi.bitunix.com/api/v1/futures/tpsl/get_history_orders");
  });

  it("cancel -> POST /api/v1/futures/tpsl/cancel_order", async () => {
    const response = await callAction("cancel", { orderId: "1", symbol: "BTCUSDT" });

    expect(response.status).toBe(200);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://fapi.bitunix.com/api/v1/futures/tpsl/cancel_order");
    expect(options.method).toBe("POST");
  });

  it("modify -> POST /api/v1/futures/tpsl/modify_order", async () => {
    const response = await callAction("modify", {
      orderId: "1",
      tpPrice: "50000",
      tpStopType: "MARK_PRICE",
    });

    expect(response.status).toBe(200);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://fapi.bitunix.com/api/v1/futures/tpsl/modify_order");
    expect(options.method).toBe("POST");
  });

  it("place -> POST /api/v1/futures/tpsl/place_order", async () => {
    const response = await callAction("place", {
      symbol: "BTCUSDT",
      positionId: "pos-1",
      tpPrice: "70000",
      tpQty: "0.5",
    });

    expect(response.status).toBe(200);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("https://fapi.bitunix.com/api/v1/futures/tpsl/place_order");
    expect(options.method).toBe("POST");
  });

  it("place-position -> POST /api/v1/futures/tpsl/position/place_order", async () => {
    const response = await callAction("place-position", {
      symbol: "BTCUSDT",
      positionId: "pos-1",
      tpPrice: "70000",
    });

    expect(response.status).toBe(200);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain(
      "https://fapi.bitunix.com/api/v1/futures/tpsl/position/place_order",
    );
    expect(options.method).toBe("POST");
  });

  it("a write forwards the signed bytes verbatim", async () => {
    // The body *is* what the client signed, so the route must not re-serialise
    // it — a second JSON.stringify would drop whitespace and the venue would
    // reject a signature over different bytes than the ones it received.
    const params = { orderId: "1", symbol: "BTCUSDT" };
    const body = buildTpslWriteBody(params);
    const { request, url } = await signedEnvelopeRequest("/api/tpsl?action=cancel", body, {});

    const response = await handler({ request, url });

    expect(response.status).toBe(200);
    const [, options] = fetchMock.mock.calls[0];
    expect(options.body).toBe(JSON.stringify(params));
    // The wrapper is transport, not payload: Bitunix reads `orderId` at the top
    // level, and `exchange`/`action` are Cachy's own.
    expect(JSON.parse(options.body)).not.toHaveProperty("params");
  });

  it("still holds a write body to the shape that action signs", async () => {
    // The wrapper the schema discriminates on no longer travels, so the route
    // rebuilds it — without that, a write would reach Bitunix unchecked.
    const { request, url } = await signedEnvelopeRequest(
      "/api/tpsl?action=cancel",
      buildTpslWriteBody({ orderId: "1" }),
      {},
    );

    const response = await handler({ request, url });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("Validation Error");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still holds a modify's legs to its own refinement", async () => {
    // `modify` carries a rule the other writers do not: at least one of
    // tpPrice/slPrice, the same field the venue reads as "which leg is being
    // touched". A shared "invalid write" case would exercise `cancel`'s shape
    // and leave this one free to drift.
    const response = await callAction("modify", { orderId: "1" });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("Validation Error");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still holds a read's params to the shape that action signs", async () => {
    // The read path validates before it looks at the envelope, so a bad param
    // is answered as a validation error rather than as a signature problem —
    // and never reaches the venue.
    const response = await callAction("pending", { symbol: 123 });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("Validation Error");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a read forwards the client envelope and never the secret", async () => {
    await callAction("pending", {});

    const [url, options] = fetchMock.mock.calls[0];
    expect(options.headers["api-key"]).toBe(TEST_SIGNING_KEYS.apiKey);
    expect(options.headers["sign"]).toBeTruthy();
    expect(JSON.stringify(options.headers)).not.toContain(TEST_SIGNING_KEYS.apiSecret);
    expect(String(url)).not.toContain(TEST_SIGNING_KEYS.apiSecret);
  });

  it("rejects a request that names no action", async () => {
    // The first guard on the route, and the one no envelope can answer for:
    // shape, venue and endpoint are all properties of the action, so a request
    // without one is answered before any of them is resolved.
    const url = new URL("http://localhost/api/tpsl");
    const request = new Request(url, { method: "POST", body: "{}" });

    const response = await handler({ request, url });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("Missing action");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown action", async () => {
    const { request, url } = await signedEnvelopeRequest("/api/tpsl?action=nonsense", {});
    const response = await handler({ request, url });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("Unknown action");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sanitizes the venue's credential leak out of the error response", async () => {
    // Bitunix answers a bad credential with "Invalid API Key: <the key>" —
    // the log line is redacted, and the client response must be too. Sibling
    // sync routes sanitize both; this pins the same for /api/tpsl.
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Invalid API Key: LEAKED-SECRET-12345",
    });

    const response = await callAction("pending", {});

    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("LEAKED-SECRET-12345");
  });

  it("rejects a write with no envelope", async () => {
    const url = new URL("http://localhost/api/tpsl?action=cancel");
    const request = new Request(url, {
      method: "POST",
      body: JSON.stringify({ orderId: "1", symbol: "BTCUSDT" }),
    });

    const response = await handler({ request, url });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("PRESIGNED_ENVELOPE_MISSING");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
