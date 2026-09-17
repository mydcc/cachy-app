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
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * The load-bearing assertions here are the absences: no `x-api-secret`
 * anywhere, and no passphrase outside the Bitget-reachable routes. A test that
 * only checked the signature was present would pass while the boundary leaked.
 */
import { describe, it, expect, vi } from "vitest";
import { SIGNING_ERRORS, exchangeSignedFetch, signCachyRequest } from "./browserSigning";
import { buildVenueBody } from "./venueBodies";
import { ORDER_ERRORS } from "./orderErrors";
import { bitgetUpstreamPath } from "./restSigningPlan";
import { signBitgetRequest } from "../crypto/exchangeSigning";
import type { OrderRequestPayload } from "../../types/orderSchemas";

const KEYS = {
  apiKey: "key-0001-abcdef",
  apiSecret: "secret-0001-abcdef",
  passphrase: "pass-0001",
};

const BITUNIX_KEYS = { apiKey: KEYS.apiKey, apiSecret: KEYS.apiSecret };

const NOW = () => 1_700_000_000_000;

/**
 * Raw, not schema-parsed, on purpose: `buildVenueBody` is fed the payload the
 * client will transmit — the same object the server rebuilds from — so a
 * fixture that ran the Zod schema first would test a normalisation neither side
 * performs.
 */
const PLACE_ORDER_BITUNIX = {
  exchange: "bitunix",
  type: "place-order",
  symbol: "BTCUSDT",
  side: "BUY",
  orderType: "MARKET",
  qty: "1",
} as unknown as OrderRequestPayload;

describe("signCachyRequest — Bitunix", () => {
  it("emits a full envelope on a query-signed route", async () => {
    const signed = await signCachyRequest({
      cachyPath: "/api/balance",
      keys: BITUNIX_KEYS,
      venue: "bitunix",
      queryParams: { marginCoin: "USDT" },
      now: NOW,
    });

    expect(signed.headers["x-api-key"]).toBe(KEYS.apiKey);
    expect(signed.headers["x-api-sign"]).toMatch(/^[0-9a-f]{64}$/);
    expect(signed.headers["x-api-timestamp"]).toBe(String(NOW()));
    expect(signed.headers["x-api-nonce"]).toMatch(/^[0-9a-f]{32}$/);
    expect(signed.headers["x-api-query"]).toBe("marginCoin=USDT");
  });

  // Guards the branch order, not a condition inside the branch: a Bitunix route
  // returns before the passphrase is read, so moving that read above the branch
  // is the regression this catches.
  it("never emits a passphrase header, even when keys carry one", async () => {
    const signed = await signCachyRequest({
      cachyPath: "/api/sync",
      keys: { ...KEYS, passphrase: "must-not-ride" },
      queryParams: { symbol: "BTCUSDT" },
      now: NOW,
    });

    expect(signed.headers["x-api-passphrase"]).toBeUndefined();
    expect(JSON.stringify(signed.headers)).not.toContain("must-not-ride");
  });

  // Signed bytes and transported bytes are two different things on this shape.
  // The signature covers the *venue* body, which carries neither `type` nor
  // `exchange` and so cannot be what the route receives; the route therefore
  // receives that body wrapped as `venueBody` alongside the fields it parses.
  it("signs the venue body and transports it wrapped on a body-signed route", async () => {
    const payload = PLACE_ORDER_BITUNIX;
    const signed = await signCachyRequest({
      cachyPath: "/api/orders",
      keys: BITUNIX_KEYS,
      venue: "bitunix",
      payload,
      now: NOW,
    });

    const transmitted = JSON.parse(signed.body as string) as Record<string, unknown>;
    expect(transmitted.venueBody).toBe(buildVenueBody("bitunix", payload));
    expect(transmitted).toMatchObject(payload);
    expect(signed.headers["x-api-query"]).toBeUndefined();
  });

  it("refuses a body-signed route whose action names no venue body", async () => {
    await expect(
      signCachyRequest({
        cachyPath: "/api/orders",
        keys: BITUNIX_KEYS,
        venue: "bitunix",
        payload: { exchange: "bitunix", symbol: "BTCUSDT" },
        now: NOW,
      }),
    ).rejects.toThrow(ORDER_ERRORS.VALIDATION_ERROR);
  });

  it("omits the body on a query-signed route", async () => {
    const signed = await signCachyRequest({
      cachyPath: "/api/sync/orders",
      keys: BITUNIX_KEYS,
      queryParams: { limit: "500" },
      now: NOW,
    });

    expect(signed.body).toBeUndefined();
  });
});

describe("signCachyRequest — Bitget", () => {
  // The signature has to cover the path Bitget will reconstruct, which is the
  // *upstream* one — the route forwards there. Signing Cachy's own path is a
  // signature Bitget rejects, and the envelope guard cannot catch it: the only
  // part both sides compare is the query string. The expected path is read from
  // the table `bitget.ts` forwards from, so this pins the two against each
  // other rather than the signer against a fixture that agrees with it.
  it("signs the upstream path rather than the Cachy one", async () => {
    const upstreamPath = bitgetUpstreamPath("/api/positions");
    if (upstreamPath === null) {
      throw new Error("the Bitget path table has no entry for /api/positions");
    }

    const queryParams = { productType: "UMCBL" };
    const signed = await signCachyRequest({
      cachyPath: "/api/positions",
      keys: KEYS,
      venue: "bitget",
      queryParams,
      now: NOW,
    });

    const bitgetWouldCompute = await signBitgetRequest(
      KEYS.apiSecret,
      "GET",
      upstreamPath,
      queryParams,
      null,
      { timestamp: signed.headers["x-api-timestamp"] },
    );

    expect(signed.headers["x-api-sign"]).toBe(bitgetWouldCompute.signature);
  });

  it("carries the passphrase but no nonce, under the ADR-0013 exception", async () => {
    const signed = await signCachyRequest({
      cachyPath: "/api/balance",
      keys: KEYS,
      venue: "bitget",
      queryParams: { productType: "UMCBL" },
      upstreamPath: "/api/mix/v1/account/accounts",
      now: NOW,
    });

    expect(signed.headers["x-api-passphrase"]).toBe(KEYS.passphrase);
    expect(signed.headers["x-api-nonce"]).toBeUndefined();
    expect(signed.headers["x-api-sign"]).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(signed.headers["x-api-timestamp"]).toBe(String(NOW()));
  });

  // Bitget's private calls need all three credentials, and the server used to
  // be the one to say so (`MISSING_PASSPHRASE`). Refusing here is the same
  // answer one hop earlier, not a new one — see the credential-shape suite.
  it("refuses to sign without the passphrase the venue requires", async () => {
    await expect(
      signCachyRequest({
        cachyPath: "/api/balance",
        keys: { apiKey: KEYS.apiKey, apiSecret: KEYS.apiSecret },
        venue: "bitget",
        queryParams: { productType: "UMCBL" },
        upstreamPath: "/api/mix/v1/account/accounts",
        now: NOW,
      }),
    ).rejects.toThrow("Invalid Passphrase");
  });

  it("signs the body for a body-signed route", async () => {
    const payload = { ...PLACE_ORDER_BITUNIX, exchange: "bitget" };
    const signed = await signCachyRequest({
      cachyPath: "/api/orders",
      keys: KEYS,
      venue: "bitget",
      payload,
      upstreamPath: "/api/mix/v1/order/place-order",
      now: NOW,
    });

    const transmitted = JSON.parse(signed.body as string) as Record<string, unknown>;
    expect(transmitted.venueBody).toBe(buildVenueBody("bitget", payload));
    expect(signed.headers["x-api-passphrase"]).toBe(KEYS.passphrase);
  });

  // The other half of the query-route case above. `/api/orders` carries its
  // action in the *body* on a write, so a lookup that read the URL alone would
  // find no row and put every Bitget write back on Cachy's path — which is the
  // bug the fix this pins was about. Expected path read from the table
  // `bitget.ts` forwards from, so the two are pinned against each other.
  it("resolves the upstream path from the body action on a write", async () => {
    const payload = { ...PLACE_ORDER_BITUNIX, exchange: "bitget" };

    const signed = await signCachyRequest({
      cachyPath: "/api/orders",
      keys: KEYS,
      venue: "bitget",
      payload,
      now: NOW,
    });

    const upstreamPath = bitgetUpstreamPath("/api/orders", "place-order");
    if (upstreamPath === null) {
      throw new Error("the Bitget path table has no entry for place-order");
    }

    const bitgetWouldCompute = await signBitgetRequest(
      KEYS.apiSecret,
      "POST",
      upstreamPath,
      {},
      buildVenueBody("bitget", payload),
      { timestamp: signed.headers["x-api-timestamp"] },
    );

    expect(signed.headers["x-api-sign"]).toBe(bitgetWouldCompute.signature);
  });
});

describe("signCachyRequest — explicit action", () => {
  it("resolves a query shape from the explicit action on a bare path", async () => {
    const signed = await signCachyRequest({
      cachyPath: "/api/orders",
      action: "pending",
      keys: BITUNIX_KEYS,
      venue: "bitunix",
      queryParams: { symbol: "BTCUSDT" },
      now: NOW,
    });

    expect(signed.body).toBeUndefined();
    expect(signed.headers["x-api-query"]).toBe("symbol=BTCUSDT");
  });

  it("keeps resolving the shape from the URL when no action is passed", async () => {
    const signed = await signCachyRequest({
      cachyPath: "/api/orders?action=history",
      keys: BITUNIX_KEYS,
      venue: "bitunix",
      queryParams: { limit: "50" },
      now: NOW,
    });

    expect(signed.body).toBeUndefined();
    expect(signed.headers["x-api-query"]).toBe("limit=50");
  });

  it("refuses an explicit action the URL disagrees with", async () => {
    await expect(
      signCachyRequest({
        cachyPath: "/api/orders?action=pending",
        action: "history",
        keys: BITUNIX_KEYS,
        venue: "bitunix",
        queryParams: {},
        now: NOW,
      }),
    ).rejects.toThrow(SIGNING_ERRORS.ACTION_MISMATCH);
  });
});

describe("signCachyRequest — the secret never rides", () => {
  it("keeps the secret out of the envelope on every route and venue", async () => {
    const cases = [
      { cachyPath: "/api/balance", venue: "bitunix" as const, queryParams: { a: "1" } },
      { cachyPath: "/api/balance", venue: "bitget" as const, queryParams: { a: "1" } },
      { cachyPath: "/api/orders", venue: "bitunix" as const, payload: PLACE_ORDER_BITUNIX },
      {
        cachyPath: "/api/orders",
        venue: "bitget" as const,
        payload: { ...PLACE_ORDER_BITUNIX, exchange: "bitget" },
      },
      { cachyPath: "/api/tpsl", venue: "bitunix" as const, queryParams: { orderId: "42" } },
      { cachyPath: "/api/sync", venue: "bitunix" as const, queryParams: { symbol: "BTCUSDT" } },
    ];

    for (const testCase of cases) {
      const signed = await signCachyRequest({ ...testCase, keys: KEYS, now: NOW });
      const serialised = JSON.stringify(signed.headers) + (signed.body ?? "");

      expect(serialised).not.toContain(KEYS.apiSecret);
      expect(Object.keys(signed.headers)).not.toContain("x-api-secret");
    }
  });
});

describe("signCachyRequest — preconditions", () => {
  it("refuses a route that has not been migrated", async () => {
    await expect(
      signCachyRequest({ cachyPath: "/api/klines", keys: BITUNIX_KEYS, now: NOW }),
    ).rejects.toThrow(SIGNING_ERRORS.ROUTE_NOT_MIGRATED);
  });

  it("requires an explicit venue on a multi-venue route", async () => {
    await expect(
      signCachyRequest({ cachyPath: "/api/account", keys: KEYS, now: NOW }),
    ).rejects.toThrow(SIGNING_ERRORS.VENUE_REQUIRED);
  });

  it("refuses a venue the route cannot reach", async () => {
    await expect(
      signCachyRequest({
        cachyPath: "/api/tpsl",
        keys: KEYS,
        venue: "bitget",
        queryParams: { orderId: "1" },
        now: NOW,
      }),
    ).rejects.toThrow(SIGNING_ERRORS.VENUE_NOT_SUPPORTED);
  });

  // ADR-0013 failure mode 3. Without the guard the signers fail on
  // `.digest of undefined` inside `crypto.subtle`, which reads as a broken app
  // rather than as "this origin is not a secure context".
  it("refuses to sign outside a secure context", async () => {
    vi.stubGlobal("crypto", {});
    try {
      await expect(
        signCachyRequest({ cachyPath: "/api/sync", keys: BITUNIX_KEYS, now: NOW }),
      ).rejects.toThrow(SIGNING_ERRORS.INSECURE_CONTEXT);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("infers the venue on a single-venue route", async () => {
    const signed = await signCachyRequest({
      cachyPath: "/api/sync",
      keys: BITUNIX_KEYS,
      queryParams: { symbol: "BTCUSDT" },
      now: NOW,
    });

    expect(signed.headers["x-api-nonce"]).toBeDefined();
  });
});

describe("signCachyRequest — nonce freshness", () => {
  it("does not reuse a nonce across concurrent calls", async () => {
    const [a, b, c] = await Promise.all([
      signCachyRequest({ cachyPath: "/api/sync", keys: BITUNIX_KEYS, now: NOW }),
      signCachyRequest({ cachyPath: "/api/sync", keys: BITUNIX_KEYS, now: NOW }),
      signCachyRequest({ cachyPath: "/api/sync", keys: BITUNIX_KEYS, now: NOW }),
    ]);

    const nonces = [a, b, c].map((signed) => signed.headers["x-api-nonce"]);
    expect(new Set(nonces).size).toBe(3);
  });
});

describe("exchangeSignedFetch", () => {
  it("POSTs the envelope and the signed body", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const response = await exchangeSignedFetch({
      cachyPath: "/api/orders",
      keys: KEYS,
      venue: "bitunix",
      payload: PLACE_ORDER_BITUNIX,
      now: NOW,
      fetchFn,
    });

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].init.method).toBe("POST");
    expect((calls[0].init.headers as Record<string, string>)["x-api-key"]).toBe(KEYS.apiKey);
    const transmitted = JSON.parse(calls[0].init.body as string) as Record<string, unknown>;
    expect(transmitted.venueBody).toBe(buildVenueBody("bitunix", PLACE_ORDER_BITUNIX));
    expect(transmitted.symbol).toBe("BTCUSDT");
  });

  it("lets a caller add headers without displacing the envelope", async () => {
    let captured: Record<string, string> = {};
    const fetchFn = (async (_url: string, init: RequestInit) => {
      captured = init.headers as Record<string, string>;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    await exchangeSignedFetch({
      cachyPath: "/api/account",
      keys: BITUNIX_KEYS,
      venue: "bitunix",
      queryParams: { marginCoin: "USDT" },
      headers: { "x-provider": "bitunix" },
      now: NOW,
      fetchFn,
    });

    expect(captured["x-provider"]).toBe("bitunix");
    expect(captured["x-api-sign"]).toMatch(/^[0-9a-f]{64}$/);
    expect(captured["x-api-secret"]).toBeUndefined();
  });

  // The envelope is merged last precisely so a caller cannot displace it. A
  // caller that passes its own `x-api-key` would otherwise sign with one key and
  // advertise another, which the server guard cannot detect — it compares signed
  // bytes, not key identity.
  it("keeps envelope when caller passes colliding credentials", async () => {
    let captured: Record<string, string> = {};
    const fetchFn = (async (_url: string, init: RequestInit) => {
      captured = init.headers as Record<string, string>;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    await exchangeSignedFetch({
      cachyPath: "/api/orders",
      keys: KEYS,
      venue: "bitunix",
      payload: PLACE_ORDER_BITUNIX,
      headers: { "x-api-key": "attacker-key", "x-api-sign": "attacker-sign" },
      now: NOW,
      fetchFn,
    });

    expect(captured["x-api-key"]).toBe(KEYS.apiKey);
    expect(captured["x-api-sign"]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("carries a declared action in the request URL the server reads", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    await exchangeSignedFetch({
      cachyPath: "/api/orders",
      action: "pending",
      keys: BITUNIX_KEYS,
      venue: "bitunix",
      queryParams: { symbol: "BTCUSDT" },
      now: NOW,
      fetchFn,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/orders?action=pending");
    expect((calls[0].init.headers as Record<string, string>)["x-api-query"]).toBe(
      "symbol=BTCUSDT",
    );
  });
});

describe("signCachyRequest — credential shape", () => {
  // The server's `validateKeys` needed the secret, which no longer reaches it.
  // This is that check at the only layer that still holds key material: without
  // it a bad secret would be signed into an envelope and come back as a venue
  // rejection rather than as "Invalid API Secret".
  it("refuses a secret too short to be one, on a query-signed route", async () => {
    await expect(
      signCachyRequest({
        cachyPath: "/api/sync",
        keys: { apiKey: KEYS.apiKey, apiSecret: "sh" },
        queryParams: { symbol: "BTCUSDT" },
        now: NOW,
      }),
    ).rejects.toThrow("Invalid API Secret");
  });

  it("refuses a missing key before it signs anything", async () => {
    await expect(
      signCachyRequest({
        cachyPath: "/api/sync",
        keys: { apiKey: "", apiSecret: KEYS.apiSecret },
        queryParams: { symbol: "BTCUSDT" },
        now: NOW,
      }),
    ).rejects.toThrow("Invalid API Key");
  });

  it("refuses a body-signed route on the same grounds", async () => {
    await expect(
      signCachyRequest({
        cachyPath: "/api/orders",
        keys: { apiKey: KEYS.apiKey, apiSecret: "" },
        venue: "bitunix",
        payload: PLACE_ORDER_BITUNIX,
        now: NOW,
      }),
    ).rejects.toThrow("Invalid API Secret");
  });
});
