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

import { describe, it, expect } from "vitest";
import {
  PRESIGNED_ERRORS,
  assertPresignedConsistency,
  readPresignedEnvelope,
} from "./presignedEnvelope";

const VALID_HEADERS = {
  "x-api-key": "key-0001",
  "x-api-sign": "deadbeef",
  "x-api-timestamp": "1700000000000",
};

function requestWith(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/orders", { headers });
}

describe("readPresignedEnvelope", () => {
  it("reads the mandatory fields", () => {
    const envelope = readPresignedEnvelope(requestWith(VALID_HEADERS));

    expect(envelope).toMatchObject({
      apiKey: "key-0001",
      signature: "deadbeef",
      timestamp: "1700000000000",
    });
  });

  it("reads the optional fields when present", () => {
    const envelope = readPresignedEnvelope(
      requestWith({
        ...VALID_HEADERS,
        "x-api-nonce": "abcd",
        "x-api-query": "a=1",
        "x-api-passphrase": "pass",
      }),
    );

    expect(envelope).toMatchObject({ nonce: "abcd", query: "a=1", passphrase: "pass" });
  });

  it("returns null when a mandatory field is missing", () => {
    expect(readPresignedEnvelope(requestWith({ "x-api-sign": "x", "x-api-timestamp": "1" }))).toBeNull();
    expect(readPresignedEnvelope(requestWith({ "x-api-key": "x", "x-api-timestamp": "1" }))).toBeNull();
    expect(readPresignedEnvelope(requestWith({ "x-api-key": "x", "x-api-sign": "x" }))).toBeNull();
  });

  it("returns null for an empty header value", () => {
    expect(readPresignedEnvelope(requestWith({ ...VALID_HEADERS, "x-api-sign": "" }))).toBeNull();
  });

  it("does not read credentials out of the body", () => {
    const request = new Request("http://localhost/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey: "key-0001", apiSecret: "secret-0001" }),
    });

    expect(readPresignedEnvelope(request)).toBeNull();
  });
});

describe("assertPresignedConsistency — query-signed routes", () => {
  const consistency = (query: string | undefined, rebuilt: string) =>
    assertPresignedConsistency({
      cachyPath: "/api/sync",
      envelope: { apiKey: "k", signature: "s", timestamp: "1", query },
      rebuilt,
    });

  it("accepts a matching query string", () => {
    expect(() => consistency("a=1&b=2", "a=1&b=2")).not.toThrow();
  });

  it("rejects a divergent query string", () => {
    expect(() => consistency("a=1", "a=2")).toThrow(PRESIGNED_ERRORS.DIVERGENCE);
  });

  it("treats an absent x-api-query as a missing envelope, not a divergence", () => {
    expect(() => consistency(undefined, "a=1")).toThrow(PRESIGNED_ERRORS.MISSING_ENVELOPE);
  });
});

describe("assertPresignedConsistency — body-signed routes", () => {
  const consistency = (rawBody: string | undefined, rebuilt: string) =>
    assertPresignedConsistency({
      cachyPath: "/api/orders",
      envelope: { apiKey: "k", signature: "s", timestamp: "1" },
      rebuilt,
      rawBody,
    });

  it("accepts a matching body", () => {
    expect(() => consistency('{"a":1}', '{"a":1}')).not.toThrow();
  });

  it("rejects a reordered body", () => {
    expect(() => consistency('{"b":1,"a":2}', '{"a":2,"b":1}')).toThrow(
      PRESIGNED_ERRORS.DIVERGENCE,
    );
  });

  it("treats an absent body as a missing envelope", () => {
    expect(() => consistency(undefined, "{}")).toThrow(PRESIGNED_ERRORS.MISSING_ENVELOPE);
  });

  it("ignores x-api-query on a body-signed route", () => {
    expect(() =>
      assertPresignedConsistency({
        cachyPath: "/api/orders",
        envelope: { apiKey: "k", signature: "s", timestamp: "1", query: "a=1" },
        rebuilt: "{}",
        rawBody: "{}",
      }),
    ).not.toThrow();
  });
});

describe("assertPresignedConsistency — passphrase boundary", () => {
  it("rejects a passphrase on a Bitunix-hardwired route", () => {
    expect(() =>
      assertPresignedConsistency({
        cachyPath: "/api/tpsl",
        envelope: { apiKey: "k", signature: "s", timestamp: "1", query: "a=1", passphrase: "p" },
        rebuilt: "a=1",
      }),
    ).toThrow(PRESIGNED_ERRORS.UNEXPECTED_PASSPHRASE);
  });

  it("rejects a passphrase on each of the seven Bitunix routes", () => {
    const bitunixRoutes = [
      ["/api/tpsl", "query"],
      ["/api/leverage-margin-mode", "query"],
      ["/api/sync", "query"],
      ["/api/sync/orders", "query"],
      ["/api/sync/order-detail", "query"],
      ["/api/sync/positions-history", "query"],
      ["/api/sync/positions-pending", "query"],
    ] as const;

    for (const [cachyPath, shape] of bitunixRoutes) {
      expect(() =>
        assertPresignedConsistency({
          cachyPath,
          envelope: { apiKey: "k", signature: "s", timestamp: "1", query: "q", passphrase: "p" },
          rebuilt: "q",
          rawBody: shape === "body" ? "q" : undefined,
        }),
      ).toThrow(PRESIGNED_ERRORS.UNEXPECTED_PASSPHRASE);
    }
  });

  it("allows a passphrase on a Bitget-reachable route", () => {
    expect(() =>
      assertPresignedConsistency({
        cachyPath: "/api/balance",
        envelope: { apiKey: "k", signature: "s", timestamp: "1", query: "a=1", passphrase: "p" },
        rebuilt: "a=1",
      }),
    ).not.toThrow();
  });

  it("allows an absent passphrase anywhere", () => {
    expect(() =>
      assertPresignedConsistency({
        cachyPath: "/api/sync",
        envelope: { apiKey: "k", signature: "s", timestamp: "1", query: "a=1" },
        rebuilt: "a=1",
      }),
    ).not.toThrow();
  });
});

describe("assertPresignedConsistency — unmigrated routes", () => {
  it("stays out of the way until the route is cut over", () => {
    expect(() =>
      assertPresignedConsistency({
        cachyPath: "/api/klines",
        envelope: { apiKey: "k", signature: "s", timestamp: "1" },
        rebuilt: "",
      }),
    ).not.toThrow();
  });
});
