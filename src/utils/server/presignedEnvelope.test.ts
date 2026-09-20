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
  bitunixCallHeaders,
  checkPresignedRequest,
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
      envelope: { apiKey: "k", signature: "s", timestamp: "1", nonce: "n", query },
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

  it("accepts an empty query string, which a route with no parameters signs", () => {
    expect(() => consistency("", "")).not.toThrow();
  });
});

describe("readPresignedEnvelope — an empty query is not an absent one", () => {
  it("reads an explicitly empty x-api-query as an empty string", () => {
    const envelope = readPresignedEnvelope(
      requestWith({ ...VALID_HEADERS, "x-api-query": "" }),
    );

    expect(envelope?.query).toBe("");
  });

  it("still reads a query header that is not sent at all as absent", () => {
    expect(readPresignedEnvelope(requestWith(VALID_HEADERS))?.query).toBeUndefined();
  });
});

describe("assertPresignedConsistency — body-signed routes", () => {
  const consistency = (rawBody: string | undefined, rebuilt: string) =>
    assertPresignedConsistency({
      cachyPath: "/api/orders",
      envelope: { apiKey: "k", signature: "s", timestamp: "1", nonce: "n" },
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
        envelope: { apiKey: "k", signature: "s", timestamp: "1", nonce: "n", query: "a=1" },
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
        envelope: { apiKey: "k", signature: "s", timestamp: "1", nonce: "n", query: "a=1", passphrase: "p" },
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
          envelope: { apiKey: "k", signature: "s", timestamp: "1", nonce: "n", query: "q", passphrase: "p" },
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
        envelope: { apiKey: "k", signature: "s", timestamp: "1", nonce: "n", query: "a=1", passphrase: "p" },
        rebuilt: "a=1",
      }),
    ).not.toThrow();
  });

  it("allows an absent passphrase anywhere", () => {
    expect(() =>
      assertPresignedConsistency({
        cachyPath: "/api/sync",
        envelope: { apiKey: "k", signature: "s", timestamp: "1", nonce: "n", query: "a=1" },
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

describe("assertPresignedConsistency — a route whose shape follows the action", () => {
  const envelope = { apiKey: "k", signature: "s", timestamp: "1", nonce: "n" };

  it("checks the query on a read action", () => {
    expect(() =>
      assertPresignedConsistency({
        cachyPath: "/api/tpsl?action=pending",
        envelope: { ...envelope, query: "symbol=BTCUSDT" },
        rebuilt: "symbol=BTCUSDT",
      }),
    ).not.toThrow();
  });

  it("checks the body on a write action, where no query is sent at all", () => {
    expect(() =>
      assertPresignedConsistency({
        cachyPath: "/api/tpsl?action=place",
        envelope,
        rebuilt: '{"a":1}',
        rawBody: '{"a":1}',
      }),
    ).not.toThrow();
  });

  it("refuses a write action whose body diverged", () => {
    expect(() =>
      assertPresignedConsistency({
        cachyPath: "/api/tpsl?action=place",
        envelope,
        rebuilt: '{"a":1}',
        rawBody: '{"a":2}',
      }),
    ).toThrow(PRESIGNED_ERRORS.DIVERGENCE);
  });

  it("refuses a write action that carried no body", () => {
    expect(() =>
      assertPresignedConsistency({
        cachyPath: "/api/tpsl?action=place",
        envelope,
        rebuilt: '{"a":1}',
      }),
    ).toThrow(PRESIGNED_ERRORS.MISSING_ENVELOPE);
  });

  it("falls back to the route's shape for an action it does not name", () => {
    expect(() =>
      assertPresignedConsistency({
        cachyPath: "/api/tpsl?action=something-new",
        envelope: { ...envelope, query: "a=1" },
        rebuilt: "a=1",
      }),
    ).not.toThrow();
  });
});

describe("assertPresignedConsistency — the nonce Bitunix signs with", () => {
  it("refuses a Bitunix request that arrived without one", () => {
    expect(() =>
      assertPresignedConsistency({
        cachyPath: "/api/sync",
        envelope: { apiKey: "k", signature: "s", timestamp: "1", query: "a=1" },
        rebuilt: "a=1",
      }),
    ).toThrow(PRESIGNED_ERRORS.MISSING_ENVELOPE);
  });

  it("asks a mixed-venue route's Bitunix half for one, which needs it", () => {
    expect(() =>
      assertPresignedConsistency({
        cachyPath: "/api/balance",
        envelope: { apiKey: "k", signature: "s", timestamp: "1", query: "a=1" },
        rebuilt: "a=1",
        venue: "bitunix",
      }),
    ).toThrow(PRESIGNED_ERRORS.MISSING_ENVELOPE);
  });

  it("does not ask a mixed-venue route's Bitget half for one — Bitget has no nonce field", () => {
    expect(() =>
      assertPresignedConsistency({
        cachyPath: "/api/balance",
        envelope: { apiKey: "k", signature: "s", timestamp: "1", query: "a=1" },
        rebuilt: "a=1",
        venue: "bitget",
      }),
    ).not.toThrow();
  });

  it("keeps the plan-level rule when the route passes no venue", () => {
    expect(() =>
      assertPresignedConsistency({
        cachyPath: "/api/balance",
        envelope: { apiKey: "k", signature: "s", timestamp: "1", query: "a=1" },
        rebuilt: "a=1",
      }),
    ).toThrow(PRESIGNED_ERRORS.MISSING_ENVELOPE);
  });
});

describe("checkPresignedRequest", () => {
  const headers = {
    "x-api-key": "key-0001",
    "x-api-sign": "deadbeef",
    "x-api-timestamp": "1700000000000",
    "x-api-nonce": "abcd",
    "x-api-query": "a=1",
  };

  const post = (sentHeaders: Record<string, string>) =>
    new Request("http://localhost/api/sync", { method: "POST", headers: sentHeaders });

  it("hands the route the envelope when the bytes match", () => {
    const check = checkPresignedRequest(post(headers), {
      cachyPath: "/api/sync",
      rebuilt: "a=1",
    });

    expect(check).toMatchObject({
      ok: true,
      envelope: { apiKey: "key-0001", signature: "deadbeef", nonce: "abcd" },
    });
  });

  it("reports a missing envelope rather than throwing", () => {
    const check = checkPresignedRequest(post({}), {
      cachyPath: "/api/sync",
      rebuilt: "a=1",
    });

    expect(check).toEqual({ ok: false, code: PRESIGNED_ERRORS.MISSING_ENVELOPE });
  });

  it("reports divergent bytes rather than throwing", () => {
    const check = checkPresignedRequest(post(headers), {
      cachyPath: "/api/sync",
      rebuilt: "a=2",
    });

    expect(check).toEqual({ ok: false, code: PRESIGNED_ERRORS.DIVERGENCE });
  });
});

describe("bitunixCallHeaders", () => {
  it("forwards the client's credential material and nothing else", () => {
    const headers = bitunixCallHeaders({
      apiKey: "key-0001",
      signature: "deadbeef",
      timestamp: "1700000000000",
      nonce: "abcd",
      passphrase: "must-not-travel",
    });

    expect(headers).toEqual({
      "api-key": "key-0001",
      timestamp: "1700000000000",
      nonce: "abcd",
      sign: "deadbeef",
      "Content-Type": "application/json",
    });
    expect(Object.values(headers)).not.toContain("must-not-travel");
  });

  it("refuses an envelope with no nonce", () => {
    expect(() =>
      bitunixCallHeaders({ apiKey: "k", signature: "s", timestamp: "1" }),
    ).toThrow(PRESIGNED_ERRORS.MISSING_ENVELOPE);
  });
});
