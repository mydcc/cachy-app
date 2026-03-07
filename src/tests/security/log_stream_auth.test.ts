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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";

function computeHmac(secret: string): string {
  return crypto.createHmac("sha256", secret).update("log_stream_auth").digest("hex");
}

// Mutable mock env using vi.hoisted
const mockEnv = vi.hoisted(() => ({
  LOG_STREAM_KEY: undefined as string | undefined
}));

vi.mock("$env/dynamic/private", () => ({
  env: mockEnv
}));

// Import the handler
import { GET } from "../../routes/api/stream-logs/+server";

describe("GET /api/stream-logs Security", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.LOG_STREAM_KEY = undefined;
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  const createEvent = (urlStr: string, opts?: { token?: string; cookieHmac?: string }) => {
    const headers = new Headers();
    const parsedUrl = new URL(urlStr, "http://localhost");
    if (opts?.token) {
      headers.set("Authorization", `Bearer ${opts.token}`);
    }
    const cookies = {
      get: vi.fn((name: string) => {
        if (opts?.cookieHmac && name === "log_stream_token") return opts.cookieHmac;
        return undefined;
      })
    };
    const request = {
      url: parsedUrl,
      signal: new AbortController().signal,
      headers
    } as unknown as Request;

    return {
      request,
      url: parsedUrl,
      cookies
    } as any;
  };

  it("should deny access in development mode without token", async () => {
    process.env.NODE_ENV = "development";
    mockEnv.LOG_STREAM_KEY = "dev-secret";

    // Simulate Request
    const event = createEvent("http://localhost/api/stream-logs");

    const response = await GET(event);

    expect(response.status).toBe(401);
  });

  it("should allow access in development mode with correct token", async () => {
    process.env.NODE_ENV = "development";
    mockEnv.LOG_STREAM_KEY = "dev-secret";

    const event = createEvent("http://localhost/api/stream-logs", { token: "dev-secret" });

    const response = await GET(event);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
  });

  it("should deny access in production if LOG_STREAM_KEY is not set", async () => {
    process.env.NODE_ENV = "production";
    mockEnv.LOG_STREAM_KEY = undefined;

    const event = createEvent("http://localhost/api/stream-logs");
    const response = await GET(event);

    expect(response.status).toBe(403);
    expect(await response.text()).toContain("disabled");
  });

  it("should deny access in production if token is missing", async () => {
    process.env.NODE_ENV = "production";
    mockEnv.LOG_STREAM_KEY = "super-secret";

    const event = createEvent("http://localhost/api/stream-logs");
    const response = await GET(event);

    expect(response.status).toBe(401);
  });

  it("should deny access in production if token is wrong", async () => {
    process.env.NODE_ENV = "production";
    mockEnv.LOG_STREAM_KEY = "super-secret";

    const event = createEvent("http://localhost/api/stream-logs", { token: "wrong" });
    const response = await GET(event);

    expect(response.status).toBe(401);
  });

  it("should allow access in production if token is correct", async () => {
    process.env.NODE_ENV = "production";
    mockEnv.LOG_STREAM_KEY = "super-secret";

    const event = createEvent("http://localhost/api/stream-logs", { token: "super-secret" });
    const response = await GET(event);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
  });

  it("should allow access with valid HMAC cookie", async () => {
    process.env.NODE_ENV = "production";
    mockEnv.LOG_STREAM_KEY = "super-secret";

    const hmac = computeHmac("super-secret");
    const event = createEvent("http://localhost/api/stream-logs", { cookieHmac: hmac });
    const response = await GET(event);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(event.cookies.get).toHaveBeenCalledWith("log_stream_token");
  });

  it("should deny access with forged cookie", async () => {
    process.env.NODE_ENV = "production";
    mockEnv.LOG_STREAM_KEY = "super-secret";

    const event = createEvent("http://localhost/api/stream-logs", { cookieHmac: "forged-value" });
    const response = await GET(event);

    expect(response.status).toBe(401);
  });
});
