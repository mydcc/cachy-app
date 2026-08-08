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
});
