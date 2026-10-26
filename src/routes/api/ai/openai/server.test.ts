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

const event = (request: Request) =>
  ({ request, getClientAddress: () => "127.0.0.1" }) as unknown as Parameters<
    typeof POST
  >[0];

const sseResponse = () =>
  new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: ok\n\n"));
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("POST /api/ai/openai - Custom baseUrl support (FEAT-0306) & SSRF guard (BUG-0291)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    _resetForTests();
    // Deterministic public DNS so the SSRF guard's async check passes in CI.
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as unknown as dns.LookupAddress[]);
  });

  it("routes completions to default OpenAI endpoint when baseUrl is omitted", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse());
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

    const res = await POST(event(request));

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

  it("routes completions to a public custom baseUrl (aggregator / gateway) appending /chat/completions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse());
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
        baseUrl: "https://gateway.example.com/v1",
      }),
    });

    const res = await POST(event(request));

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.example.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty("X-Title");
    // A custom gateway is not OpenCode, so it must not see the conversation id.
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty(
      "x-opencode-session",
    );
  });

  it("keeps the OpenRouter attribution header when relaying to an OpenRouter baseUrl", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse());
    globalThis.fetch = fetchMock;

    const request = new Request("http://localhost/api/ai/openai", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-app-access-token": issueToken(),
        "x-api-key": "sk-or-test",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "hello" }],
        model: "anthropic/claude-sonnet-4",
        baseUrl: "https://openrouter.ai/api/v1",
      }),
    });

    const res = await POST(event(request));

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-or-test",
          "X-Title": "Cachy",
        }),
      }),
    );
  });

  it("sends the conversation id and an identifying user agent to OpenCode (BUG-0701)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse());
    globalThis.fetch = fetchMock;

    const request = new Request("http://localhost/api/ai/openai", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-app-access-token": issueToken(),
        "x-api-key": "sk-oc-test",
        "x-session-id": "conversation-42",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "hello" }],
        model: "kimi-k3",
        baseUrl: "https://opencode.ai/inference/go/v1",
      }),
    });

    const res = await POST(event(request));

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://opencode.ai/inference/go/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-oc-test",
          // Required by OpenCode Go: it answers 400 without this header.
          "x-opencode-session": "conversation-42",
          "User-Agent": "CachyApp/1.0 (SvelteKit)",
        }),
      }),
    );
  });

  it("keeps the OpenCode session header off other providers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse());
    globalThis.fetch = fetchMock;

    const request = new Request("http://localhost/api/ai/openai", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-app-access-token": issueToken(),
        "x-api-key": "sk-test-key",
        "x-session-id": "conversation-42",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "hello" }],
        model: "gpt-4o",
      }),
    });

    await POST(event(request));

    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty(
      "x-opencode-session",
    );
  });

  it("falls back to a fresh session id when the client sends none (BUG-0701)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse());
    globalThis.fetch = fetchMock;

    const request = new Request("http://localhost/api/ai/openai", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-app-access-token": issueToken(),
        "x-api-key": "sk-oc-test",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "hello" }],
        model: "kimi-k3",
        baseUrl: "https://opencode.ai/inference/go/v1",
      }),
    });

    const res = await POST(event(request));

    expect(res.status).toBe(200);
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers["x-opencode-session"]).toMatch(UUID_RE);
  });

  it("replaces a session id that is not header-safe instead of failing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse());
    globalThis.fetch = fetchMock;

    const request = new Request("http://localhost/api/ai/openai", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-app-access-token": issueToken(),
        "x-api-key": "sk-oc-test",
        "x-session-id": "not a valid id",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "hello" }],
        model: "kimi-k3",
        baseUrl: "https://opencode.ai/inference/go/v1",
      }),
    });

    const res = await POST(event(request));

    expect(res.status).toBe(200);
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers["x-opencode-session"]).toMatch(UUID_RE);
  });

  it("gives the model listing a session id of its own (BUG-0701)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "kimi-k3" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock;

    // The picker has no conversation, so the client sends no id — the route
    // still has to hand OpenCode a well-formed one.
    const request = new Request(
      "http://localhost/api/ai/openai/models?baseUrl=https://opencode.ai/inference/go/v1",
      {
        method: "GET",
        headers: { "x-app-access-token": issueToken() },
      },
    );

    const res = await GET_MODELS({
      url: new URL(request.url),
      request,
      getClientAddress: () => "127.0.0.1",
    } as unknown as Parameters<typeof GET_MODELS>[0]);

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://opencode.ai/inference/go/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          "User-Agent": "CachyApp/1.0 (SvelteKit)",
        }),
      }),
    );
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers["x-opencode-session"]).toMatch(UUID_RE);
  });

  it("rejects a reserved/loopback custom baseUrl with 403 (BUG-0291)", async () => {
    const fetchMock = vi.fn();
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

    const res = await POST(event(request));

    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("routes models listing to a public custom baseUrl when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "gpt-4o-custom" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock;

    const request = new Request(
      "http://localhost/api/ai/openai/models?baseUrl=https://gateway.example.com",
      {
        method: "GET",
        headers: { "x-app-access-token": issueToken() },
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
      "https://gateway.example.com/v1/models",
      expect.objectContaining({
        // The route identifies Cachy instead of a raw HTTP library. No key
        // means no Authorization, and a non-OpenCode target means no session
        // header.
        headers: { "User-Agent": "CachyApp/1.0 (SvelteKit)" },
      }),
    );
  });

  it("rejects a reserved models baseUrl with 403 (BUG-0291)", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    const request = new Request(
      "http://localhost/api/ai/openai/models?baseUrl=http://169.254.169.254",
      {
        method: "GET",
        headers: { "x-app-access-token": issueToken() },
      },
    );

    const url = new URL(request.url);

    const res = await GET_MODELS({
      url,
      request,
      getClientAddress: () => "127.0.0.1",
    } as unknown as Parameters<typeof GET_MODELS>[0]);

    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns every id a custom baseUrl reports, without the OpenAI catalog filter", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: "deepseek-v4-flash-free" },
            { id: "glm-5.2" },
            { id: "longcat-2.0:free" },
            { id: "text-embedding-3-small" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    globalThis.fetch = fetchMock;

    const request = new Request(
      "http://localhost/api/ai/openai/models?baseUrl=https://opencode.ai/zen/v1",
      { method: "GET", headers: { "x-app-access-token": issueToken() } },
    );

    const res = await GET_MODELS({
      url: new URL(request.url),
      request,
      getClientAddress: () => "127.0.0.1",
    } as unknown as Parameters<typeof GET_MODELS>[0]);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.models.map((m: { id: string }) => m.id)).toEqual([
      "deepseek-v4-flash-free",
      "glm-5.2",
      "longcat-2.0:free",
      "text-embedding-3-small",
    ]);
  });

  it("still filters OpenAI's own catalog to chat models on the default endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: "gpt-4o" },
            { id: "text-embedding-3-small" },
            { id: "whisper-1" },
            { id: "deepseek-v4-flash-free" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    globalThis.fetch = fetchMock;

    const request = new Request("http://localhost/api/ai/openai/models", {
      method: "GET",
      headers: {
        "x-app-access-token": issueToken(),
        "x-api-key": "sk-test",
      },
    });

    const res = await GET_MODELS({
      url: new URL(request.url),
      request,
      getClientAddress: () => "127.0.0.1",
    } as unknown as Parameters<typeof GET_MODELS>[0]);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.models.map((m: { id: string }) => m.id)).toEqual(["gpt-4o"]);
  });

  it("treats an explicitly pasted OpenAI endpoint as the vendor catalog", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: "gpt-4o" },
            { id: "text-embedding-3-small" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    globalThis.fetch = fetchMock;

    const request = new Request(
      "http://localhost/api/ai/openai/models?baseUrl=https://api.openai.com/v1",
      { method: "GET", headers: { "x-app-access-token": issueToken() } },
    );

    const res = await GET_MODELS({
      url: new URL(request.url),
      request,
      getClientAddress: () => "127.0.0.1",
    } as unknown as Parameters<typeof GET_MODELS>[0]);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.models.map((m: { id: string }) => m.id)).toEqual(["gpt-4o"]);
  });
});

describe("POST /api/ai/openai - proxy error boundary (BUG-0724)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    _resetForTests();
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as unknown as dns.LookupAddress[]);
  });

  const requestWith = (body: unknown) =>
    new Request("http://localhost/api/ai/openai", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-app-access-token": issueToken(),
        "x-api-key": "sk-test-key",
      },
      body: JSON.stringify(body),
    });

  it("does not relay an upstream error body that echoes the key", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message:
              "Incorrect API key sk-test-key at https://internal.example/v1",
          },
        }),
        { status: 401, headers: { "content-type": "application/json" } },
      ),
    );

    const res = await POST(
      event(requestWith({ messages: [{ role: "user", content: "hi" }] })),
    );
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "AI provider request failed" });
    expect(JSON.stringify(body)).not.toContain("sk-test-key");
    expect(consoleError).toHaveBeenCalled();
    const logged = consoleError.mock.calls.flat().join(" ");
    expect(logged).toContain("***");
    expect(logged).not.toContain("sk-test-key");
    consoleError.mockRestore();
  });

  it("refuses an oversized body before any provider call", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    const res = await POST(
      event(
        requestWith({
          messages: [{ role: "user", content: "x".repeat(1_000_001) }],
        }),
      ),
    );

    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
