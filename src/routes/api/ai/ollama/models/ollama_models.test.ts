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
import { GET } from "./+server";

const mockEnv = vi.hoisted(() => ({
  APP_ACCESS_TOKEN: "test-token",
}));

vi.mock("$env/dynamic/private", () => ({
  env: mockEnv,
}));

describe("Ollama Models Route GET", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 400 for an invalid base URL", async () => {
    const url = new URL("http://localhost/api/ai/ollama/models?baseUrl=invalid-url");
    const request = new Request(url, {
      headers: { "x-app-access-token": "test-token" },
    });

    const response = await GET({ request, url } as any);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toBe("Invalid Ollama base URL");
  });

  it("returns 502 with helpful localhost hint when fetch to Ollama fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));

    const url = new URL("http://localhost/api/ai/ollama/models?baseUrl=http%3A%2F%2Flocalhost%3A11434");
    const request = new Request(url, {
      headers: { "x-app-access-token": "test-token" },
    });

    const response = await GET({ request, url } as any);
    expect(response.status).toBe(502);

    const body = await response.json();
    expect(body.error).toContain("Could not reach Ollama at http://localhost:11434");
    expect(body.error).toContain("OLLAMA_ORIGINS");
  });

  it("returns models array when Ollama fetch succeeds", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ models: [{ name: "llama3:latest" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const url = new URL("http://localhost/api/ai/ollama/models?baseUrl=http%3A%2F%2Flocalhost%3A11434");
    const request = new Request(url, {
      headers: { "x-app-access-token": "test-token" },
    });

    const response = await GET({ request, url } as any);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.models).toEqual([{ id: "llama3:latest", label: "llama3:latest" }]);
  });
});
