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
import { POST as syncRoute } from "./sync/+server";
import { POST as syncOrders } from "./sync/orders/+server";
import { POST as syncPositionsPending } from "./sync/positions-pending/+server";
import { POST as syncPositionsHistory } from "./sync/positions-history/+server";
import { POST as syncOrderDetail } from "./sync/order-detail/+server";
import { POST as leverageMarginMode } from "./leverage-margin-mode/+server";
import { POST as accountSettings } from "./account-settings/+server";
import { POST as tpsl } from "./tpsl/+server";
import { POST as orders } from "./orders/+server";
import { POST as balance } from "./balance/+server";
import { POST as positions } from "./positions/+server";
import { POST as account } from "./account/+server";
import * as clientToken from "../../lib/server/clientToken";
import { ROUTE_SIGNING_PLAN } from "../../utils/exchange/restSigningPlan";
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
 * The eight below reach Bitunix by construction: seven are A3's, and
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

/**
 * FEAT-0405 A6 — every migrated route, both venues. The absence of a secret
 * on the wire is the item's first acceptance criterion, asserted here rather
 * than per-route so a thirteenth route cannot slip through the cracks: adding
 * a row is the migration checklist, and this list is it.
 */
const ALL_MIGRATED_ROUTES = [
  ...MIGRATED_BITUNIX_ONLY_ROUTES,
  "orders/+server.ts",
  "balance/+server.ts",
  "positions/+server.ts",
  "account/+server.ts",
] as const;

const ROUTE_DIR = resolve(process.cwd(), "src/routes/api");

const sourceOf = (relative: string) => readFileSync(resolve(ROUTE_DIR, relative), "utf8");

describe("FEAT-0405 A6 — none of the twelve migrated routes takes a secret", () => {
  it.each(ALL_MIGRATED_ROUTES)("%s never reads X-Api-Secret", (relative) => {
    const source = sourceOf(relative);

    expect(source).not.toMatch(/x-api-secret/i);
    // The helper it used to read the secret with. Its absence is the real
    // property: a route could rename the header and still consult this.
    expect(source).not.toContain("extractApiCredentials");
  });

  it.each(ALL_MIGRATED_ROUTES)("%s reads the envelope instead", (relative) => {
    expect(sourceOf(relative)).toContain("checkPresignedRequest");
  });
});

describe("BUG-0496 — the plan table and the handler list cannot disagree", () => {
  // Derived, never repeated: a plan key names a Cachy path, and each migrated
  // route lives in `src/routes/api/<path>/+server.ts`. A thirteenth plan row
  // without a handler here — or a handler without a plan row — fails below
  // naming the route, instead of waiting for a reviewer to spot it.
  const planRouteFiles = Object.keys(ROUTE_SIGNING_PLAN).map(
    (route) => `${route.replace(/^\/api\//, "")}/+server.ts`,
  );

  it("every plan row has a guarded handler in ALL_MIGRATED_ROUTES", () => {
    const missing = planRouteFiles.filter(
      (file) => !(ALL_MIGRATED_ROUTES as readonly string[]).includes(file),
    );
    expect(missing).toEqual([]);
  });

  it("every guarded handler has a plan row", () => {
    const extra = (ALL_MIGRATED_ROUTES as readonly string[]).filter(
      (file) => !planRouteFiles.includes(file),
    );
    expect(extra).toEqual([]);
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

  // The hard-cutover rule, on every route that had no live test of it.
  // A route reachable without an envelope is one that would have to fall back
  // to a transmitted secret, so "no envelope" and "no fallback" are the same
  // assertion seen from two sides.
  //
  // FEAT-0405 A6 — the rows below carry the pre-cutover shape on purpose: the
  // secret rides in `X-Api-Secret` exactly as it used to, and the route must
  // still refuse. A secret that buys nothing is absence asserted twice.
  type RouteHandler = (event: {
    request: Request;
    url?: URL;
    getClientAddress: () => string;
  }) => Promise<Response>;

  /** A pre-cutover request: schema-valid body, transmitted secret, no envelope. */
  function oldShapeRequest(path: string, body: unknown): { request: Request; url: URL } {
    const url = new URL(`http://localhost${path}`);
    const request = new Request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": "test-key-12345",
        "X-Api-Secret": "test-secret-12345",
      },
      body: JSON.stringify(body),
    });
    return { request, url };
  }

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
    [
      "/api/sync",
      syncRoute as unknown as RouteHandler,
      { limit: 50 },
    ],
    [
      "/api/sync/orders",
      syncOrders as unknown as RouteHandler,
      { limit: 100 },
    ],
    [
      "/api/sync/positions-history",
      syncPositionsHistory as unknown as RouteHandler,
      { limit: 10 },
    ],
    [
      "/api/tpsl?action=pending",
      tpsl as unknown as RouteHandler,
      { exchange: "bitunix", action: "pending", params: {} },
    ],
    [
      "/api/tpsl?action=cancel",
      tpsl as unknown as RouteHandler,
      { orderId: "1", symbol: "BTCUSDT" },
    ],
    [
      "/api/orders?action=pending",
      orders as unknown as RouteHandler,
      { exchange: "bitunix", type: "pending" },
    ],
    [
      "/api/orders?action=cancel-all",
      orders as unknown as RouteHandler,
      { exchange: "bitunix", type: "cancel-all", symbol: "BTCUSDT", venueBody: "{}" },
    ],
    [
      "/api/balance",
      balance as unknown as RouteHandler,
      { exchange: "bitunix" },
    ],
    [
      "/api/positions",
      positions as unknown as RouteHandler,
      { exchange: "bitunix" },
    ],
    [
      "/api/account",
      account as unknown as RouteHandler,
      { exchange: "bitunix" },
    ],
  ])("%s answers 400 with no envelope", async (path, handler, body) => {
    const { request, url } = oldShapeRequest(path, body);

    const response = await handler({ request, url, getClientAddress });

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
