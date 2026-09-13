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
import { issueToken, _resetForTests } from "../../../../lib/server/clientToken";

const { POST } = await import("./+server");
const { GET: GET_MODELS } = await import("./models/+server");

const sseResponse = () =>
  new Response("data: ok\n\n", {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });

describe("POST /api/ai/anthropic - SSRF guard (BUG-0291)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    _resetForTests();
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as unknown as dns.LookupAddress[]);
  });

  it("routes messages to the default Anthropic endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse());
    globalThis.fetch = fetchMock;

    const request = new Request("http://localhost/api/ai/anthropic", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-app-access-token": issueToken(),
        "x-api-key": "sk-ant-test",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "hello" }],
        model: "claude-sonnet-5",
      }),
    });

    const res = await POST({
      request,
      getClientAddress: () => "127.0.0.1",
    } as unknown as Parameters<typeof POST>[0]);

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("rejects a reserved/loopback custom baseUrl with 403", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    const request = new Request("http://localhost/api/ai/anthropic", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-app-access-token": issueToken(),
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "hello" }],
        baseUrl: "http://169.254.169.254",
      }),
    });

    const res = await POST({
      request,
      getClientAddress: () => "127.0.0.1",
    } as unknown as Parameters<typeof POST>[0]);

    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a reserved models baseUrl with 403", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    const request = new Request(
      "http://localhost/api/ai/anthropic/models?baseUrl=http://192.168.1.10",
      { method: "GET", headers: { "x-app-access-token": issueToken() } },
    );

    const res = await GET_MODELS({
      url: new URL(request.url),
      request,
      getClientAddress: () => "127.0.0.1",
    } as unknown as Parameters<typeof GET_MODELS>[0]);

    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
