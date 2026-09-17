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
import {
  ROUTE_SIGNING_PLAN,
  canonicalQueryParamsInput,
  canonicalQueryString,
  type MigratedRoute,
  type Venue,
} from "./restSigningPlan";
import { exchangeSignedFetch, signCachyRequest } from "./browserSigning";
import { buildVenueBody } from "./venueBodies";
import { ORDER_ERRORS } from "./orderErrors";
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
  // `type` is load-bearing on the two body rows since A4: the client builds the
  // venue body itself (`buildVenueBody`), and that dispatch is on `type`. A
  // sample without one is a payload the signer is right to refuse.
  "/api/orders": {
    payload: {
      exchange: "bitunix",
      type: "place-order",
      symbol: "BTCUSDT",
      side: "BUY",
      orderType: "MARKET",
      qty: "1",
    },
    upstreamPath: "/api/mix/v1/order/place-order",
  },
  "/api/account-settings": {
    payload: { exchange: "bitunix", type: "change-margin-mode", symbol: "BTCUSDT", marginCoin: "USDT", marginMode: "CROSS" },
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
      const signInput = {
        cachyPath: route,
        keys: venue === "bitunix" ? BITUNIX_KEYS : KEYS,
        venue,
        payload: sample.payload,
        queryParams: sample.params,
        upstreamPath: sample.upstreamPath,
        now: FIXED,
      };

      // A4: on a body row the signature covers the *venue* body, which from the
      // cutover on is built on this side — `buildVenueBody` dispatches on `type`,
      // which no venue body carries. Where no venue body exists for the action
      // (Bitget implements none of the account-settings family) there are no
      // bytes to compare, and the property that has to hold instead is that the
      // client refuses rather than signing something the server's own rebuild
      // cannot produce.
      let venueBody: string | null = null;
      if (plan.signed === "body") {
        try {
          venueBody = buildVenueBody(venue, sample.payload as never);
        } catch (e) {
          // An unexpected throw is a broken sample, not an absent body: only the
          // documented refusal may take this exit.
          expect(e instanceof Error ? e.message : "").toBe(ORDER_ERRORS.VALIDATION_ERROR);
          await expect(signCachyRequest(signInput)).rejects.toThrow(ORDER_ERRORS.VALIDATION_ERROR);
          continue;
        }
      }

      const signed = await signCachyRequest(signInput);

      const serverBytes =
        venue === "bitunix"
          ? generateBitunixSignature(KEYS.apiKey, KEYS.apiSecret, sample.params ?? {}, venueBody)
          : generateBitgetSignature(
              KEYS.apiSecret,
              plan.signed === "body" ? "POST" : "GET",
              sample.upstreamPath ?? route,
              sample.params ?? {},
              venueBody,
            );

      if (plan.signed === "body") {
        // Signed bytes and transported bytes differ here on purpose: the venue
        // body rides in `venueBody`, and the fields the route Zod-validates ride
        // beside it. The server forwards the former verbatim and rebuilds it
        // from the latter, so `venueBody` is what a one-byte disagreement would
        // show up in.
        const transmitted = JSON.parse(signed.body as string) as Record<string, unknown>;
        expect(transmitted.venueBody).toBe(venueBody);
        expect(transmitted.venueBody).toBe(serverBytes.bodyStr);
        expect(transmitted).toMatchObject(sample.payload as Record<string, unknown>);
        expect(signed.headers["x-api-query"]).toBeUndefined();
      } else {
        expect(signed.headers["x-api-query"]).toBe(serverBytes.queryString);
        expect(signed.body).toBeUndefined();

        // The plan table exports its own canonicalisers, meant to be what the
        // server side rebuilds with in A3/A4. They are only safe to use if they
        // produce exactly the bytes the signers do: two canonicalisers that
        // disagree is ADR-0013's second failure mode, and it stays invisible
        // until a request is rejected mid-trade. Nothing in production consumes
        // the table's pair yet, so this gate is the only thing comparing them.
        //
        // Bitunix only. `canonicalQueryString` sorts by `localeCompare`, which
        // is Bitunix's rule; Bitget's prehash takes the parameters in insertion
        // order, so asserting the table's form on the Bitget half would fail on
        // any route with more than one parameter — the pair is not
        // venue-agnostic, and A3/A4 must not reach for it on the Bitget routes.
        // The Bitget bytes are pinned by the signature oracle below instead,
        // which is the property that actually has to hold.
        if (venue === "bitunix") {
          expect(signed.headers["x-api-query"]).toBe(canonicalQueryString(sample.params ?? {}));
        }
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
      const body = venueBody ?? "";

      if (venue === "bitunix") {
        const digestParams = Object.keys(sample.params ?? {})
          .sort()
          .map((key) => key + (sample.params ?? {})[key])
          .join("");
        expect(digestParams).toBe(canonicalQueryParamsInput(sample.params ?? {}));
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

  // A body-signed route reached with no payload at all: a caller that has not
  // decided what to send yet, or a handler reading a field that is not there.
  //
  // Up to A3 the signer turned that absence into an empty string, on both sides
  // (the client spelled the guard out; the server's parameter default rewrote a
  // bare `undefined` to `null`, which matters because `JSON.stringify(undefined)`
  // would otherwise concatenate into the prehash as the literal `"undefined"`).
  //
  // A4 makes the absence unrepresentable on the wire instead. The signed bytes
  // are now the *venue* body, and there is no venue body for a payload with no
  // action in it, so neither side can produce one: the client refuses, and the
  // server's rebuild throws in the same place. The signer's half of the old
  // property is still pinned — an absent body still signs as `""`, never as
  // `"undefined"` — but it is no longer reachable through a body-signed route.
  it.each(ROUTES.filter((route) => ROUTE_SIGNING_PLAN[route].signed === "body"))(
    "%s refuses an absent body, and the signer still signs it as the empty string",
    async (route) => {
      const plan = ROUTE_SIGNING_PLAN[route];
      const sample = SAMPLES[route];

      for (const venue of plan.venues as readonly Venue[]) {
        await expect(
          signCachyRequest({
            cachyPath: route,
            keys: venue === "bitunix" ? BITUNIX_KEYS : KEYS,
            venue,
            payload: undefined,
            queryParams: sample.params,
            upstreamPath: sample.upstreamPath,
            now: FIXED,
          }),
        ).rejects.toThrow(ORDER_ERRORS.VALIDATION_ERROR);

        const serverBytes =
          venue === "bitunix"
            ? generateBitunixSignature(KEYS.apiKey, KEYS.apiSecret, sample.params ?? {}, undefined)
            : generateBitgetSignature(
                KEYS.apiSecret,
                "POST",
                sample.upstreamPath ?? route,
                sample.params ?? {},
                undefined,
              );

        // `""` and `"undefined"` are both strings, so nothing upstream of this
        // assertion can tell them apart — only the venue would, by rejecting the
        // signature.
        expect(serverBytes.bodyStr).toBe("");
      }
    },
  );
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
