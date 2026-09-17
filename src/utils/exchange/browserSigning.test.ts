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

const KEYS = {
  apiKey: "key-0001-abcdef",
  apiSecret: "secret-0001-abcdef",
  passphrase: "pass-0001",
};

const BITUNIX_KEYS = { apiKey: KEYS.apiKey, apiSecret: KEYS.apiSecret };

const NOW = () => 1_700_000_000_000;

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

  it("sends the signed bytes as the body on a body-signed route", async () => {
    const payload = { exchange: "bitunix", symbol: "BTCUSDT", qty: "1" };
    const signed = await signCachyRequest({
      cachyPath: "/api/orders",
      keys: BITUNIX_KEYS,
      venue: "bitunix",
      payload,
      now: NOW,
    });

    expect(signed.body).toBe(JSON.stringify(payload));
    expect(signed.headers["x-api-query"]).toBeUndefined();
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

  it("omits the passphrase when the caller holds none", async () => {
    const signed = await signCachyRequest({
      cachyPath: "/api/balance",
      keys: { apiKey: KEYS.apiKey, apiSecret: KEYS.apiSecret },
      venue: "bitget",
      queryParams: { productType: "UMCBL" },
      upstreamPath: "/api/mix/v1/account/accounts",
      now: NOW,
    });

    expect(signed.headers["x-api-passphrase"]).toBeUndefined();
  });

  it("signs the body for a body-signed route", async () => {
    const payload = { exchange: "bitget", symbol: "BTCUSDT" };
    const signed = await signCachyRequest({
      cachyPath: "/api/orders",
      keys: KEYS,
      venue: "bitget",
      payload,
      upstreamPath: "/api/mix/v1/order/place-order",
      now: NOW,
    });

    expect(signed.body).toBe(JSON.stringify(payload));
    expect(signed.headers["x-api-passphrase"]).toBe(KEYS.passphrase);
  });
});

describe("signCachyRequest — the secret never rides", () => {
  it("keeps the secret out of the envelope on every route and venue", async () => {
    const cases = [
      { cachyPath: "/api/balance", venue: "bitunix" as const, queryParams: { a: "1" } },
      { cachyPath: "/api/balance", venue: "bitget" as const, queryParams: { a: "1" } },
      { cachyPath: "/api/orders", venue: "bitunix" as const, payload: { a: 1 } },
      { cachyPath: "/api/orders", venue: "bitget" as const, payload: { a: 1 } },
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
      payload: { exchange: "bitunix", symbol: "BTCUSDT" },
      now: NOW,
      fetchFn,
    });

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].init.method).toBe("POST");
    expect((calls[0].init.headers as Record<string, string>)["x-api-key"]).toBe(KEYS.apiKey);
    expect(calls[0].init.body).toBe(JSON.stringify({ exchange: "bitunix", symbol: "BTCUSDT" }));
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
      payload: { exchange: "bitunix", symbol: "BTCUSDT" },
      headers: { "x-api-key": "attacker-key", "x-api-sign": "attacker-sign" },
      now: NOW,
      fetchFn,
    });

    expect(captured["x-api-key"]).toBe(KEYS.apiKey);
    expect(captured["x-api-sign"]).toMatch(/^[0-9a-f]{64}$/);
  });
});
