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
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { POST as syncPositionsPending } from "./sync/positions-pending/+server";
import { POST as syncPositionsHistory } from "./sync/positions-history/+server";
import { POST as syncOrderDetail } from "./sync/order-detail/+server";
import { POST as leverageMarginMode } from "./leverage-margin-mode/+server";
import { POST as accountSettings } from "./account-settings/+server";
import * as clientToken from "../../lib/server/clientToken";
import { signedEnvelopeRequest } from "../../tests/helpers/signedEnvelopeRequest";
import {
  buildLeverageMarginModeQueryParams,
  buildOrderDetailQueryParams,
} from "../../utils/exchange/venueQueries";

/**
 * FEAT-0405 — the acceptance evidence for the Bitunix-only routes.
 *
 * The absence of a thing is what this asserts, and absence is not observable
 * from behaviour: a handler that quietly still read `X-Api-Secret` would pass
 * every behavioural test in this repository. So the source is read directly.
 * Each file drops out of this list as it is migrated; when the list is empty
 * the migration is done, which is the point.
 *
 * The seven below are A3's and reach Bitunix by construction.
 * `account-settings` joined them in A5a: it is a multi-venue *route* that only
 * one venue implements, and `ROUTE_SIGNING_PLAN` now says so.
 */
const MIGRATED_BITUNIX_ONLY_ROUTES = [
  "tpsl/+server.ts",
  "leverage-margin-mode/+server.ts",
  "sync/+server.ts",
  "sync/orders/+server.ts",
  "sync/order-detail/+server.ts",
  "sync/positions-history/+server.ts",
  "sync/positions-pending/+server.ts",
  "account-settings/+server.ts",
] as const;

const ROUTE_DIR = resolve(process.cwd(), "src/routes/api");

const sourceOf = (relative: string) => readFileSync(resolve(ROUTE_DIR, relative), "utf8");

describe("FEAT-0405 A3 — the Bitunix-only routes take no secret", () => {
  it.each(MIGRATED_BITUNIX_ONLY_ROUTES)("%s never reads X-Api-Secret", (relative) => {
    const source = sourceOf(relative);

    expect(source).not.toMatch(/x-api-secret/i);
    // The helper it used to read the secret with. Its absence is the real
    // property: a route could rename the header and still consult this.
    expect(source).not.toContain("extractApiCredentials");
  });

  it.each(MIGRATED_BITUNIX_ONLY_ROUTES)("%s reads the envelope instead", (relative) => {
    expect(sourceOf(relative)).toContain("checkPresignedRequest");
  });
});

describe("FEAT-0405 A3 — the guard's rules on a live route", () => {
  const getClientAddress = () => "127.0.0.1";
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(clientToken, "checkClientToken").mockReturnValue(null);
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ code: 0, data: { positionList: [] } }),
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("refuses a passphrase on a route Bitunix-only in the plan table", async () => {
    // The passphrase is the Bitget credential. Bitunix never asks for it, so a
    // request carrying one is either a client that mixed up its venues or a
    // credential being smuggled past the table — and the venue cannot tell the
    // difference either.
    const { request } = await signedEnvelopeRequest(
      "/api/sync/positions-history",
      { limit: 10 },
      { limit: "10" },
    );
    const withPassphrase = new Request(request.url, {
      method: "POST",
      headers: new Headers({
        ...Object.fromEntries(request.headers.entries()),
        "x-api-passphrase": "should-not-be-here",
      }),
      body: await request.text(),
    });

    const response = await syncPositionsHistory({
      request: withPassphrase,
      getClientAddress,
    } as unknown as Parameters<typeof syncPositionsHistory>[0]);

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("PRESIGNED_UNEXPECTED_PASSPHRASE");
  });

  it("accepts a route whose signed query is empty", async () => {
    // `/api/sync/positions-pending` signs no parameters at all, so its query
    // string is the empty string — which is only representable because
    // `x-api-query` is read as present-or-absent rather than as truthy. A
    // regression to a truthy read makes this route unmigratable, and this is
    // the test that says so.
    const { request } = await signedEnvelopeRequest(
      "/api/sync/positions-pending",
      {},
      {},
    );

    expect(request.headers.get("x-api-query")).toBe("");

    const response = await syncPositionsPending({
      request,
      getClientAddress,
    } as unknown as Parameters<typeof syncPositionsPending>[0]);

    expect(response.status).toBe(200);
  });

  // The hard-cutover rule, on the three routes that had no live test of it.
  // A route reachable without an envelope is one that would have to fall back
  // to a transmitted secret, so "no envelope" and "no fallback" are the same
  // assertion seen from two sides.
  type RouteHandler = (event: {
    request: Request;
    getClientAddress: () => string;
  }) => Promise<Response>;

  it.each([
    [
      "/api/leverage-margin-mode",
      leverageMarginMode as unknown as RouteHandler,
      { exchange: "bitunix", symbol: "BTCUSDT" },
    ],
    [
      "/api/sync/order-detail",
      syncOrderDetail as unknown as RouteHandler,
      { orderId: "1" },
    ],
    [
      "/api/sync/positions-pending",
      syncPositionsPending as unknown as RouteHandler,
      {},
    ],
    [
      // A body-signed route: the payload has to be well-formed, and the signed
      // bytes have to be present as a string, before the envelope is what is
      // missing. Both are checked ahead of the guard on purpose — a request
      // with neither is a wiring bug, not a stale client.
      "/api/account-settings",
      accountSettings as unknown as RouteHandler,
      {
        exchange: "bitunix",
        type: "change-leverage",
        symbol: "BTCUSDT",
        leverage: 10,
        venueBody: "{}",
      },
    ],
  ])("%s answers 400 with no envelope", async (path, handler, body) => {
    const request = new Request(`http://localhost${path}`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    const response = await handler({ request, getClientAddress });

    expect(response.status).toBe(400);
    // The rejection code, not the envelope shape: these routes answer either a
    // flat `{error}` or the `{success,error:{code}}` envelope, and the property
    // under test here is that the request never reaches the venue.
    expect(JSON.stringify(await response.json())).toContain(
      "PRESIGNED_ENVELOPE_MISSING",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  // Byte fidelity is the failure that only shows up as a venue rejection
  // mid-trade, so the happy path is asserted, not just the rejection: what the
  // client signed is what the venue receives, and the two defaults the builders
  // own (`marginCoin`) resolve identically on both sides.
  it.each([
    [
      "/api/leverage-margin-mode",
      leverageMarginMode as unknown as RouteHandler,
      { exchange: "bitunix", symbol: "BTCUSDT" },
      buildLeverageMarginModeQueryParams({ symbol: "BTCUSDT" }),
      // Keys are sorted, so this also pins the canonical form the venue is
      // handed — a change to the sort order is a change to every signature.
      "marginCoin=USDT&symbol=BTCUSDT",
    ],
    [
      "/api/leverage-margin-mode",
      leverageMarginMode as unknown as RouteHandler,
      { exchange: "bitunix", symbol: "ETHUSDT", marginCoin: "USDC" },
      buildLeverageMarginModeQueryParams({ symbol: "ETHUSDT", marginCoin: "USDC" }),
      "marginCoin=USDC&symbol=ETHUSDT",
    ],
    [
      "/api/sync/order-detail",
      syncOrderDetail as unknown as RouteHandler,
      { orderId: "1" },
      buildOrderDetailQueryParams({ orderId: "1" }),
      "orderId=1",
    ],
  ])(
    "%s forwards the query it was given, byte for byte",
    async (path, handler, body, query, expectedQuery) => {
      const { request } = await signedEnvelopeRequest(path, body, query);

      if (path === "/api/leverage-margin-mode") {
        // The proxy validates the venue payload at the source (BUG-0515),
        // so byte-fidelity needs a well-formed venue answer behind it.
        const symbol =
          typeof (body as { symbol?: unknown }).symbol === "string"
            ? (body as { symbol: string }).symbol
            : "BTCUSDT";
        fetchMock.mockResolvedValue({
          ok: true,
          text: async () =>
            JSON.stringify({
              code: 0,
              data: {
                symbol,
                marginCoin: "USDT",
                leverage: 10,
                marginMode: "cross",
              },
            }),
        });
      }

      const response = await handler({ request, getClientAddress });

      expect(response.status).toBe(200);
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain(expectedQuery);
    },
  );
});
