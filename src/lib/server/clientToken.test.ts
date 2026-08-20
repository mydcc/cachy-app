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

import { describe, it, expect, beforeEach } from "vitest";
import { checkClientToken, issueToken, _resetForTests } from "./clientToken";

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
