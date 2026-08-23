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
import {
  checkClientToken,
  issueToken,
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
