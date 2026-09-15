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

/**
 * A2 conformance gate (FEAT-0405, ADR-0013 failure mode 2).
 *
 * After the cutover the server stops signing and starts *comparing*: it rebuilds
 * the bytes it believes the client signed and rejects the request when they
 * differ (`assertPresignedConsistency`). So a one-byte disagreement between the
 * client serialiser and the server serialiser is not a degraded signature, it is
 * a total 400 rate on the affected route. This file is the gate that is supposed
 * to fail first, before that reaches a venue.
 *
 * Two independent things are checked, and both need to hold:
 *
 * 1. **The algorithm matches the vendor spec.** An oracle built from the literals
 *    in `docs/bitunix-api/01_sign.md` and from the documented Bitget prehash is
 *    recomputed with `node:crypto`. It shares no code with either implementation,
 *    so it cannot drift along with them — which is the whole point, and the
 *    reason the expected value is not simply read out of the product.
 *
 * 2. **The two serialisers agree per route.** For every row of
 *    `ROUTE_SIGNING_PLAN` the bytes the client would sign are compared against
 *    the bytes the server module produces for the same input. A route added to
 *    the table without a sample here fails the exhaustiveness check below.
 *
 * The vendor example prints its digest rather than quoting a fixed value, so
 * there is no known-answer vector to copy. The oracle is therefore the spec's
 * own inputs run through the spec's own formula — independent of the product,
 * which is the property being relied on.
 */
import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ROUTE_SIGNING_PLAN, type MigratedRoute, type Venue } from "./restSigningPlan";
import { exchangeSignedFetch, signCachyRequest } from "./browserSigning";
import { signBitgetRequest, signBitunixRequest } from "../crypto/exchangeSigning";
import { generateBitunixSignature } from "../server/bitunix";
import { generateBitgetSignature } from "../server/bitget";

const KEYS = {
  apiKey: "key-0001-abcdef",
  apiSecret: "secret-0001-abcdef",
  passphrase: "pass-0001",
};
const BITUNIX_KEYS = { apiKey: KEYS.apiKey, apiSecret: KEYS.apiSecret };

const NOW = 1_700_000_000_000;
const FIXED = () => NOW;

/** `docs/bitunix-api/01_sign.md` — "Signatur-Beispiel (Go)", verbatim inputs. */
const DOC = {
  nonce: "123456",
  timestamp: "20241120123045",
  apiKey: "yourApiKey",
  apiSecret: "yourSecretKey",
  queryParamsStr: "id1uid200",
  body: '{"uid":"2899","arr":[{"id":1,"name":"maple"},{"id":2,"name":"lily"}]}',
};

/**
 * The spec's two-step construction, written out here rather than imported.
 * Step 1: `digest = SHA256(nonce + timestamp + api-key + queryParams + body)`.
 * Step 2: `sign = SHA256(digest + secretKey)`.
 */
const docBitunixSign = (
  nonce: string,
  timestamp: string,
  apiKey: string,
  apiSecret: string,
  queryParamsStr: string,
  body: string,
): string => {
  const sha256Hex = (input: string) => createHash("sha256").update(input).digest("hex");
  const digest = sha256Hex(nonce + timestamp + apiKey + queryParamsStr + body);
  return sha256Hex(digest + apiSecret);
};

/** Bitget Mix V1: `Base64(HMAC-SHA256(timestamp + METHOD + path?query + body, secret))`. */
const docBitgetSign = (
  apiSecret: string,
  timestamp: string,
  method: string,
  fullPath: string,
  body: string,
): string => createHmac("sha256", apiSecret).update(timestamp + method.toUpperCase() + fullPath + body).digest("base64");

interface RouteSample {
  /** Query parameters. Query-signed routes only. */
  params?: Record<string, string>;
  /** Request body. Body-signed routes only. */
  payload?: unknown;
  /** Upstream path Bitget folds into its prehash. Bitget-reachable routes only. */
  upstreamPath?: string;
}

/**
 * One sample per route, and deliberately not one per shape: the sample has to
 * exercise the route's own row, so a route whose `signed` value is wrong is
 * caught here rather than passed over by a generic fixture.
 *
 * `upstreamPath` is the route's business, not this table's — the same value is
 * handed to both serialisers, so a wrong path cancels out and cannot be detected
 * from here. What is being pinned is the *serialisation* of whatever the route
 * passes, not the route's choice of path.
 */
const SAMPLES: Record<MigratedRoute, RouteSample> = {
  "/api/orders": {
    payload: { exchange: "bitunix", symbol: "BTCUSDT", side: "BUY", orderType: "MARKET", qty: "1" },
    upstreamPath: "/api/mix/v1/order/place-order",
  },
  "/api/account-settings": {
    payload: { exchange: "bitunix", marginMode: "CROSS" },
    upstreamPath: "/api/mix/v1/account/setMarginMode",
  },
  "/api/balance": { params: { marginCoin: "USDT" }, upstreamPath: "/api/mix/v1/account/accounts" },
  "/api/positions": { params: { symbol: "BTCUSDT", marginCoin: "USDT" }, upstreamPath: "/api/mix/v1/position/allPosition" },
  "/api/account": { params: { marginCoin: "USDT" }, upstreamPath: "/api/mix/v1/account/account" },
  "/api/tpsl": { params: { orderId: "42", symbol: "BTCUSDT" } },
  "/api/leverage-margin-mode": { params: { symbol: "BTCUSDT", marginCoin: "USDT", marginMode: "CROSS" } },
  "/api/sync": { params: { symbol: "BTCUSDT" } },
  "/api/sync/orders": { params: { limit: "500", symbol: "BTCUSDT" } },
  "/api/sync/order-detail": { params: { orderId: "42" } },
  "/api/sync/positions-history": { params: { limit: "100" } },
  "/api/sync/positions-pending": { params: { limit: "100" } },
};

const ROUTES = Object.keys(ROUTE_SIGNING_PLAN) as MigratedRoute[];

describe("A2 — vendor spec oracle", () => {
  it("reproduces the Bitunix doc example through the client signer", async () => {
    const signed = await signBitunixRequest(
      DOC.apiKey,
      DOC.apiSecret,
      // The doc's `"id1uid200"` is two pairs — `id=1` and `uid=200` — joined in
      // ascending key order. Two keys rather than one is load-bearing: with a
      // single key the ordering rule is a no-op and a reversed sort would pass
      // this vector unpunished.
      { id: "1", uid: "200" },
      // A string body is taken verbatim, which is what the doc demands: the
      // signed string and the wire string have to be the same characters.
      DOC.body,
      { nonce: DOC.nonce, timestamp: DOC.timestamp },
    );

    expect(signed.signature).toBe(
      docBitunixSign(DOC.nonce, DOC.timestamp, DOC.apiKey, DOC.apiSecret, DOC.queryParamsStr, DOC.body),
    );
    // `queryString` is the URL form, not the digest form — the two are
    // deliberately different and neither substitutes for the other.
    expect(signed.queryString).toBe("id=1&uid=200");
    expect(signed.bodyStr).toBe(DOC.body);
  });

  it("reproduces the Bitget prehash through the client signer", async () => {
    const body = '{"symbol":"BTCUSDT","marginCoin":"USDT"}';
    const signed = await signBitgetRequest(
      KEYS.apiSecret,
      "POST",
      "/api/mix/v1/order/place-order",
      {},
      body,
      { timestamp: "1700000000000" },
    );

    expect(signed.signature).toBe(
      docBitgetSign(KEYS.apiSecret, "1700000000000", "POST", "/api/mix/v1/order/place-order", body),
    );
  });

  it("keeps the server signer on the same side of the same oracle", () => {
    // Pins the other half: the server module must satisfy the spec too, or the
    // comparison in `assertPresignedConsistency` compares two wrong things.
    const serverSide = generateBitunixSignature(DOC.apiKey, DOC.apiSecret, { id: "1", uid: "200" }, DOC.body);
    const expected = docBitunixSign(
      serverSide.nonce,
      serverSide.timestamp,
      DOC.apiKey,
      DOC.apiSecret,
      DOC.queryParamsStr,
      DOC.body,
    );
    expect(serverSide.signature).toBe(expected);

    const bitget = generateBitgetSignature(KEYS.apiSecret, "POST", "/api/mix/v1/order/place-order", {}, '{"a":1}');
    expect(bitget.signature).toBe(
      docBitgetSign(KEYS.apiSecret, bitget.timestamp, "POST", "/api/mix/v1/order/place-order", '{"a":1}'),
    );
  });
});

describe("A2 — client and server serialise the same bytes, per route", () => {
  it("has a sample for every route in the plan table", () => {
    // A route added without a sample would silently skip both sweeps below,
    // which is the failure this gate exists to prevent.
    expect(Object.keys(SAMPLES).sort()).toEqual([...ROUTES].sort());
  });

  it.each(ROUTES)("%s agrees between the envelope builder and the server signer", async (route) => {
    const plan = ROUTE_SIGNING_PLAN[route];
    const sample = SAMPLES[route];

    for (const venue of plan.venues as readonly Venue[]) {
      const signed = await signCachyRequest({
        cachyPath: route,
        keys: venue === "bitunix" ? BITUNIX_KEYS : KEYS,
        venue,
        payload: sample.payload,
        queryParams: sample.params,
        upstreamPath: sample.upstreamPath,
        now: FIXED,
      });

      const serverBytes =
        venue === "bitunix"
          ? generateBitunixSignature(
              KEYS.apiKey,
              KEYS.apiSecret,
              sample.params ?? {},
              plan.signed === "body" ? sample.payload : null,
            )
          : generateBitgetSignature(
              KEYS.apiSecret,
              plan.signed === "body" ? "POST" : "GET",
              sample.upstreamPath ?? route,
              sample.params ?? {},
              plan.signed === "body" ? sample.payload : null,
            );

      if (plan.signed === "body") {
        expect(signed.body).toBe(serverBytes.bodyStr);
        expect(signed.body).toBe(JSON.stringify(sample.payload));
        expect(signed.headers["x-api-query"]).toBeUndefined();
      } else {
        expect(signed.headers["x-api-query"]).toBe(serverBytes.queryString);
        expect(signed.body).toBeUndefined();
      }

      // The signature itself, against the spec oracle rather than against the
      // other implementation. The envelope's nonce and timestamp are random by
      // design — a cached one would be rejected as a replay — so the server
      // cannot be asked to reproduce this signature, and the only way to check
      // the client's own digest input is to recompute it from the documented
      // rule. `x-api-query` above is the *URL* form; the digest input is the
      // undelimited `key+value` form spelled out in the spec, and a route whose
      // parameters are sorted differently is exactly the byte divergence this
      // gate exists for. The samples carry more than one key where the route
      // does, so a broken sort cannot pass by being a no-op.
      const timestamp = signed.headers["x-api-timestamp"];
      const body = plan.signed === "body" ? JSON.stringify(sample.payload) : "";

      if (venue === "bitunix") {
        const digestParams = Object.keys(sample.params ?? {})
          .sort()
          .map((key) => key + (sample.params ?? {})[key])
          .join("");
        expect(signed.headers["x-api-sign"]).toBe(
          docBitunixSign(signed.headers["x-api-nonce"], timestamp, KEYS.apiKey, KEYS.apiSecret, digestParams, body),
        );
      } else {
        const method = plan.signed === "body" ? "POST" : "GET";
        const query = plan.signed === "body" ? "" : new URLSearchParams(sample.params ?? {}).toString();
        const fullPath = query ? `${sample.upstreamPath}?${query}` : sample.upstreamPath;
        expect(signed.headers["x-api-sign"]).toBe(
          docBitgetSign(KEYS.apiSecret, timestamp, method, fullPath ?? route, body),
        );
      }
    }
  });
});

describe("A2 — the bytes on the wire are the bytes that were signed", () => {
  it("forwards the signer's own serialisation, not a second stringify", async () => {
    // A body-signed route whose payload is already a serialised string. The
    // signer takes such a body verbatim, so re-stringifying it would put a
    // quoted string on the wire and sign a different one — the exact divergence
    // `assertPresignedConsistency` answers with a 400.
    const payload = '{"exchange":"bitunix","symbol":"BTCUSDT"}';
    const calls: RequestInit[] = [];
    const fetchFn = (async (_url: string, init: RequestInit) => {
      calls.push(init);
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const signed = await signCachyRequest({
      cachyPath: "/api/orders",
      keys: BITUNIX_KEYS,
      venue: "bitunix",
      payload,
      now: FIXED,
    });

    await exchangeSignedFetch({
      cachyPath: "/api/orders",
      keys: BITUNIX_KEYS,
      venue: "bitunix",
      payload,
      now: FIXED,
      fetchFn,
    });

    expect(calls[0].body).toBe(payload);
    expect(calls[0].body).toBe(signed.body);
  });
});
