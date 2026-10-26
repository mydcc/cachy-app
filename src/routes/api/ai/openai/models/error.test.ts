/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from "vitest";
import dns from "node:dns";
import { issueToken, _resetForTests } from "../../../../../lib/server/clientToken";

const { GET } = await import("./+server");

const event = (request: Request) =>
  ({
    url: new URL(request.url),
    request,
    getClientAddress: () => "127.0.0.1",
  }) as unknown as Parameters<typeof GET>[0];

describe("GET /api/ai/openai/models - error boundary (BUG-0724)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    _resetForTests();
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as unknown as dns.LookupAddress[]);
  });

  it("returns the generic message when the upstream echoes a key", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { message: "Invalid key sk-models-key at https://internal.example" },
        }),
        { status: 401, headers: { "content-type": "application/json" } },
      ),
    );

    const request = new Request("http://localhost/api/ai/openai/models", {
      method: "GET",
      headers: {
        "x-app-access-token": issueToken(),
        "x-api-key": "sk-models-key",
      },
    });

    const response = await GET(event(request));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "AI provider request failed" });
    expect(JSON.stringify(body)).not.toContain("sk-models-key");

    const logged = consoleError.mock.calls.flat().join(" ");
    expect(logged).toContain("***");
    expect(logged).not.toContain("sk-models-key");
    consoleError.mockRestore();
  });
});
