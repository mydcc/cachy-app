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
import { GET } from "./+server";
import { issueToken, _resetForTests } from "../../../../../lib/server/clientToken";

const getClientAddress = () => "127.0.0.1";

describe("Ollama Models Route GET", () => {
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
    "http://0177.0.0.1:11434",
    "http://2130706433:11434",
    "http://0x7f000001:11434",
  ];

  for (const baseUrl of prohibitedBaseUrls) {
    it(`rejects private or reserved baseUrl ${baseUrl} with 403 Forbidden`, async () => {
      const url = new URL(`http://localhost/api/ai/ollama/models?baseUrl=${encodeURIComponent(baseUrl)}`);
      const request = new Request(url, {
        headers: { "x-app-access-token": token },
      });

      const response = await GET({ request, url, getClientAddress } as unknown as Parameters<typeof GET>[0]);
      expect(response.status).toBe(403);

      const body = await response.json();
      expect(body.error).toMatch(/prohibited|forbidden|invalid/i);
    });
  }

  it("returns 400 for an invalid base URL", async () => {
    const url = new URL("http://localhost/api/ai/ollama/models?baseUrl=invalid-url");
    const request = new Request(url, {
      headers: { "x-app-access-token": token },
    });

    const response = await GET({ request, url, getClientAddress } as unknown as Parameters<typeof GET>[0]);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toBe("Invalid Ollama base URL");
  });

  it("returns 502 when fetch to public Ollama endpoint fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));

    const url = new URL("http://localhost/api/ai/ollama/models?baseUrl=https%3A%2F%2Follama.example.com");
    const request = new Request(url, {
      headers: { "x-app-access-token": token },
    });

    const response = await GET({ request, url, getClientAddress } as unknown as Parameters<typeof GET>[0]);
    expect(response.status).toBe(502);

    const body = await response.json();
    expect(body.error).toContain("Could not reach Ollama at https://ollama.example.com");
  });

  it("returns models array when Ollama fetch succeeds", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ models: [{ name: "llama3:latest" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const url = new URL("http://localhost/api/ai/ollama/models?baseUrl=https%3A%2F%2Follama.example.com");
    const request = new Request(url, {
      headers: { "x-app-access-token": token },
    });

    const response = await GET({ request, url, getClientAddress } as unknown as Parameters<typeof GET>[0]);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.models).toEqual([{ id: "llama3:latest", label: "llama3:latest" }]);
  });
});
