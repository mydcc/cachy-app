// @vitest-environment node
/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import dns from "node:dns";
import { POST } from "./+server";
import { issueToken, _resetForTests } from "../../../../lib/server/clientToken";

const getClientAddress = () => "127.0.0.1";

describe("Ollama AI Route POST (SSRF Guard)", () => {
  let token: string;

  beforeEach(() => {
    vi.restoreAllMocks();
    _resetForTests();
    token = issueToken();
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as unknown as dns.LookupAddress[]);
  });

  const prohibitedBaseUrls = [
    "http://127.0.0.1:11434",
    "http://localhost:11434",
    "http://169.254.169.254",
    "http://10.0.0.1:11434",
    "http://192.168.1.1:11434",
    "http://172.16.0.1:11434",
    "http://[::1]:11434",
    "http://0177.0.0.1:11434", // Octal loopback
    "http://2130706433:11434", // Decimal / DWORD loopback
    "http://0x7f000001:11434", // Hex loopback
  ];

  for (const baseUrl of prohibitedBaseUrls) {
    it(`rejects private or reserved baseUrl ${baseUrl} with 403 Forbidden`, async () => {
      const request = new Request("http://localhost/api/ai/ollama", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-app-access-token": token,
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: "hello" }],
          model: "llama3",
          baseUrl,
        }),
      });

      const response = await POST({ request, getClientAddress } as unknown as Parameters<typeof POST>[0]);
      expect(response.status).toBe(403);

      const body = await response.json();
      expect(body.error).toMatch(/prohibited|forbidden|invalid/i);
    });
  }

  it("rejects invalid URL format with 400 Bad Request", async () => {
    const request = new Request("http://localhost/api/ai/ollama", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-app-access-token": token,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "hello" }],
        model: "llama3",
        baseUrl: "invalid-url",
      }),
    });

    const response = await POST({ request, getClientAddress } as unknown as Parameters<typeof POST>[0]);
    expect(response.status).toBe(400);
  });

  it("accepts legitimate public HTTPS baseUrl", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("data: {\"response\":\"ok\"}\n\n", {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const request = new Request("http://localhost/api/ai/ollama", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-app-access-token": token,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "hello" }],
        model: "llama3",
        baseUrl: "https://ollama.example.com",
      }),
    });

    const response = await POST({ request, getClientAddress } as unknown as Parameters<typeof POST>[0]);
    expect(response.status).toBe(200);
  });

  // BUG-0295: the implicit localhost default is gone. Without a configured
  // operator default, an omitted baseUrl gets an actionable 400 — not the old
  // accidental 403.
  it("answers an omitted baseUrl with a documented remedy when no default is configured", async () => {
    delete process.env.OLLAMA_PROXY_BASE_URL;

    const request = new Request("http://localhost/api/ai/ollama", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-app-access-token": token,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "hello" }],
        model: "llama3",
      }),
    });

    const response = await POST({ request, getClientAddress } as unknown as Parameters<typeof POST>[0]);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toContain("OLLAMA_PROXY_BASE_URL");
  });

  it("forwards an omitted baseUrl to OLLAMA_PROXY_BASE_URL when configured", async () => {
    process.env.OLLAMA_PROXY_BASE_URL = "https://ollama.example.com";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("data: {\"response\":\"ok\"}\n\n", {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const request = new Request("http://localhost/api/ai/ollama", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-app-access-token": token,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "hello" }],
        model: "llama3",
      }),
    });

    try {
      const response = await POST({ request, getClientAddress } as unknown as Parameters<typeof POST>[0]);
      expect(response.status).toBe(200);
    } finally {
      delete process.env.OLLAMA_PROXY_BASE_URL;
    }
  });
});
