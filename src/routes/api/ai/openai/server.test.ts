/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { issueToken } from "../../../../lib/server/clientToken";

const { POST } = await import("./+server");
const { GET: GET_MODELS } = await import("./models/+server");

describe("POST /api/ai/openai - Custom baseUrl support (FEAT-0306)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("routes completions to default OpenAI endpoint when baseUrl is omitted", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("data: ok\n\n"));
            controller.close();
          },
        }),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      ),
    );
    globalThis.fetch = fetchMock;

    const request = new Request("http://localhost/api/ai/openai", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-app-access-token": issueToken(),
        "x-api-key": "sk-test-key",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "hello" }],
        model: "gpt-4o",
      }),
    });

    const res = await POST({
      request,
      getClientAddress: () => "127.0.0.1",
    } as unknown as Parameters<typeof POST>[0]);

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test-key",
        }),
      }),
    );
  });

  it("routes completions to custom baseUrl (OmniRoute / local gateway) appending /chat/completions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("data: ok\n\n"));
            controller.close();
          },
        }),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      ),
    );
    globalThis.fetch = fetchMock;

    const request = new Request("http://localhost/api/ai/openai", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-app-access-token": issueToken(),
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "hello" }],
        model: "llama-3.3-70b",
        baseUrl: "http://127.0.0.1:8000/v1",
      }),
    });

    const res = await POST({
      request,
      getClientAddress: () => "127.0.0.1",
    } as unknown as Parameters<typeof POST>[0]);

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("routes models listing to custom baseUrl when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ id: "gpt-4o-custom" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    globalThis.fetch = fetchMock;

    const request = new Request(
      "http://localhost/api/ai/openai/models?baseUrl=http://127.0.0.1:8000",
      {
        method: "GET",
        headers: {
          "x-app-access-token": issueToken(),
        },
      },
    );

    const url = new URL(request.url);

    const res = await GET_MODELS({
      url,
      request,
      getClientAddress: () => "127.0.0.1",
    } as unknown as Parameters<typeof GET_MODELS>[0]);

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/v1/models",
      expect.objectContaining({
        headers: {},
      }),
    );
  });
});
