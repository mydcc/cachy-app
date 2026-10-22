// @vitest-environment node
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

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "node:crypto";
import {
  checkClientToken,
  issueToken,
  onClientTokenEvicted,
  _resetForTests,
  _tokenStoreSizeForTests,
  TOKEN_TTL_MS,
  TOKEN_MAP_CAP,
} from "./clientToken";

function requestWithToken(token: string): Request {
  return new Request("http://localhost/api/test", {
    headers: token ? { "x-app-access-token": token } : {},
  });
}

describe("issueToken / checkClientToken", () => {
  beforeEach(() => {
    _resetForTests();
  });

  it("issues a token that checkClientToken then accepts", () => {
    const token = issueToken();
    const result = checkClientToken(requestWithToken(token), "1.2.3.4");
    expect(result).toBeNull();
  });

  it("issues a different token on every call", () => {
    const a = issueToken();
    const b = issueToken();
    expect(a).not.toBe(b);
  });

  it("rejects a missing token with 401", () => {
    const result = checkClientToken(requestWithToken(""), "1.2.3.4");
    expect(result).not.toBeNull();
    expect(result?.status).toBe(401);
  });

  it("rejects a token this server never issued with 401", () => {
    const result = checkClientToken(requestWithToken("forged-token"), "1.2.3.4");
    expect(result).not.toBeNull();
    expect(result?.status).toBe(401);
  });

  it("rejects a request once its token is over its per-token rate limit", () => {
    const token = issueToken();

    // The per-token ceiling is generous (300/min) — spend it all from
    // distinct IPs so the per-IP limiter never trips first, isolating what
    // this test actually asserts.
    for (let i = 0; i < 300; i++) {
      const result = checkClientToken(requestWithToken(token), `10.0.${i % 250}.${i}`);
      expect(result).toBeNull();
    }

    const overLimit = checkClientToken(requestWithToken(token), "10.0.0.99");
    expect(overLimit).not.toBeNull();
    expect(overLimit?.status).toBe(429);
  });

  it("keeps the per-token ceiling binding for a token older than a thousand later ones (BUG-0722)", () => {
    // The token store holds up to TOKEN_MAP_CAP records, but the per-token
    // limiter used to track only its default 1 000 buckets: a bucket beyond
    // the first thousand was evicted, its counter reset, and its 300-request
    // ceiling stopped binding. This token is issued first; then TOKEN_MAP_CAP
    // − 1 more are issued and each used once, so under the old cap the
    // victim's bucket was long gone before the end of the spray.
    const victim = issueToken();
    expect(checkClientToken(requestWithToken(victim), "10.0.0.99")).toBeNull();

    for (let i = 0; i < TOKEN_MAP_CAP - 1; i++) {
      const token = issueToken();
      // 250 spray IPs, each used ~40 times — far under both the per-IP
      // ceiling and the per-IP limiter's key cap, so only the per-token
      // limiter is under pressure here.
      const result = checkClientToken(requestWithToken(token), `10.1.0.${i % 250}`);
      expect(result).toBeNull();
    }

    // The victim's bucket survived the pressure: it has 299 of its 300
    // requests left, and the 301st is refused — the ceiling still binds.
    for (let i = 0; i < 299; i++) {
      expect(checkClientToken(requestWithToken(victim), "10.0.0.99")).toBeNull();
    }
    const overLimit = checkClientToken(requestWithToken(victim), "10.0.0.99");
    expect(overLimit).not.toBeNull();
    expect(overLimit?.status).toBe(429);
  });

  it("rejects a request once its IP is over its rate limit, even across different tokens", () => {
    const ip = "9.9.9.9";

    for (let i = 0; i < 600; i++) {
      const token = issueToken();
      const result = checkClientToken(requestWithToken(token), ip);
      expect(result).toBeNull();
    }

    const oneMoreToken = issueToken();
    const overLimit = checkClientToken(requestWithToken(oneMoreToken), ip);
    expect(overLimit).not.toBeNull();
    expect(overLimit?.status).toBe(429);
  });

  it("buckets IPv6 addresses of one /64 together (BUG-0722)", () => {
    // 600 requests spread over two addresses in one /64 must share the per-IP
    // ceiling; keyed on the full address, each would get its own 600 and a
    // single host with a routed /64 could rotate addresses indefinitely.
    for (let i = 0; i < 600; i++) {
      const token = issueToken();
      const ip = i % 2 === 0 ? "2001:db8:1:2::1" : "2001:db8:1:2::2";
      expect(checkClientToken(requestWithToken(token), ip)).toBeNull();
    }

    const overLimit = checkClientToken(
      requestWithToken(issueToken()),
      "2001:db8:1:2::3",
    );
    expect(overLimit).not.toBeNull();
    expect(overLimit?.status).toBe(429);
  });

  it("notifies eviction listeners when the store drops the oldest record (BUG-0722)", () => {
    const evicted: string[] = [];
    onClientTokenEvicted((hash) => evicted.push(hash));

    const oldest = issueToken();
    for (let i = 1; i < TOKEN_MAP_CAP; i++) issueToken();
    issueToken(); // the store is full: this drops `oldest`

    expect(evicted).toEqual([
      crypto.createHash("sha256").update(oldest).digest("hex"),
    ]);
  });
});

describe("token expiry and store cap (BUG-0287)", () => {
  beforeEach(() => {
    _resetForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps accepting a token right up to its TTL", () => {
    vi.useFakeTimers();
    const issuedAt = Date.now();
    const token = issueToken();

    vi.setSystemTime(issuedAt + TOKEN_TTL_MS - 1);
    expect(checkClientToken(requestWithToken(token), "1.2.3.4")).toBeNull();
  });

  it("rejects a token once its TTL has passed and removes it from the store", () => {
    vi.useFakeTimers();
    const issuedAt = Date.now();
    const token = issueToken();
    expect(checkClientToken(requestWithToken(token), "1.2.3.4")).toBeNull();

    vi.setSystemTime(issuedAt + TOKEN_TTL_MS);

    const result = checkClientToken(requestWithToken(token), "1.2.3.4");
    expect(result).not.toBeNull();
    expect(result?.status).toBe(401);
    expect(_tokenStoreSizeForTests()).toBe(0);
  });

  it("caps the store by evicting oldest entries without erroring newer tokens", () => {
    for (let i = 0; i < TOKEN_MAP_CAP; i++) {
      issueToken();
    }
    expect(_tokenStoreSizeForTests()).toBe(TOKEN_MAP_CAP);

    const newest = issueToken();
    expect(_tokenStoreSizeForTests()).toBe(TOKEN_MAP_CAP);

    expect(checkClientToken(requestWithToken(newest), "1.2.3.4")).toBeNull();
  });

  it("evicts the oldest token first once the cap is reached", () => {
    const oldest = issueToken();
    for (let i = 1; i < TOKEN_MAP_CAP; i++) {
      issueToken();
    }

    const overCap = issueToken();

    const oldestResult = checkClientToken(requestWithToken(oldest), "1.2.3.4");
    expect(oldestResult?.status).toBe(401);
    expect(checkClientToken(requestWithToken(overCap), "1.2.3.5")).toBeNull();
  });
});
