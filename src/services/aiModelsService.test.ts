// @vitest-environment happy-dom
/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getModels } from "./aiModelsService";

// appFetch auto-issues a client token when settingsState.appAccessToken is
// empty (the real default). Pre-set one here so that background request
// doesn't consume the fetch mocks these tests set up for the Ollama calls.
vi.mock("../stores/settings.svelte", () => ({
  settingsState: {
    appAccessToken: "test-token",
    secretsReady: Promise.resolve(),
  },
}));

describe("aiModelsService", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("fetches Ollama models directly via client fetch when available", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ models: [{ name: "mistral:latest" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await getModels("ollama", { baseUrl: "http://localhost:11434" }, { forceRefresh: true });
    expect(result.fromCache).toBe(false);
    expect(result.models).toEqual([{ id: "mistral:latest", label: "mistral:latest" }]);
  });

  it("falls back to server proxy if direct Ollama fetch fails", async () => {
    // First call (direct fetch to http://localhost:11434/api/tags) fails
    // Second call (appFetch to /api/ai/ollama/models?baseUrl=http://localhost:11434) succeeds
    vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("CORS block"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ models: [{ id: "phi3:latest", label: "phi3:latest" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const result = await getModels("ollama", { baseUrl: "http://localhost:11434" }, { forceRefresh: true });
    expect(result.models).toEqual([{ id: "phi3:latest", label: "phi3:latest" }]);
  });

  it("fetches OpenAI models when baseUrl is provided without apiKey", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ models: [{ id: "custom-model", label: "custom-model" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await getModels("openai", { baseUrl: "http://localhost:8000/v1" });
    expect(result.models).toEqual([{ id: "custom-model", label: "custom-model" }]);
  });

  it("lists custom provider models browser-direct without touching the server proxy", async () => {
    const seen: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      seen.push(String(input));
      return new Response(
        JSON.stringify({ object: "list", data: [{ id: "kimi-k3" }, { id: "other" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const result = await getModels(
      "openai",
      { apiKey: "sk-test", baseUrl: "https://opencode.ai/zen/go/v1" },
      { forceRefresh: true, transport: "direct", flavor: "openai-chat" },
    );
    expect(result.fromCache).toBe(false);
    expect(result.models).toEqual([
      { id: "kimi-k3", label: "kimi-k3" },
      { id: "other", label: "other" },
    ]);
    expect(seen).toEqual(["https://opencode.ai/zen/go/v1/models"]);
  });

  it("parses the Google models shape on the direct path", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [{ name: "models/gemini-2.0-flash", displayName: "Gemini 2.0 Flash" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await getModels(
      "gemini",
      { apiKey: "AIza", baseUrl: "https://generativelanguage.googleapis.com" },
      { forceRefresh: true, transport: "direct", flavor: "google-generate" },
    );
    expect(result.models).toEqual([
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    ]);
  });

  it("surfaces a direct failure instead of silently returning nothing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 403 }),
    );
    await expect(
      getModels(
        "openai",
        { apiKey: "k", baseUrl: "https://gw.example.com/v1" },
        { forceRefresh: true, transport: "direct", flavor: "openai-chat" },
      ),
    ).rejects.toThrow("403");
  });
});
