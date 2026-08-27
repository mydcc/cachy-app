/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, it, expect } from "vitest";
import { resolveProviderEndpoint } from "./aiEndpoint";

describe("resolveProviderEndpoint", () => {
  it("returns default endpoint when customBaseUrl is empty or null", () => {
    expect(
      resolveProviderEndpoint(
        null,
        "https://api.openai.com/v1/chat/completions",
        "v1/chat/completions",
      ),
    ).toBe("https://api.openai.com/v1/chat/completions");

    expect(
      resolveProviderEndpoint(
        "",
        "https://api.openai.com/v1/chat/completions",
        "v1/chat/completions",
      ),
    ).toBe("https://api.openai.com/v1/chat/completions");

    expect(
      resolveProviderEndpoint(
        "   ",
        "https://api.openai.com/v1/chat/completions",
        "v1/chat/completions",
      ),
    ).toBe("https://api.openai.com/v1/chat/completions");
  });

  it("resolves custom baseUrl without /v1 suffix (appends relativePath)", () => {
    expect(
      resolveProviderEndpoint(
        "http://localhost:8000",
        "https://api.openai.com/v1/chat/completions",
        "v1/chat/completions",
      ),
    ).toBe("http://localhost:8000/v1/chat/completions");

    expect(
      resolveProviderEndpoint(
        "http://omniroute.local:11434/",
        "https://api.openai.com/v1/chat/completions",
        "v1/chat/completions",
      ),
    ).toBe("http://omniroute.local:11434/v1/chat/completions");
  });

  it("handles custom baseUrl that already includes /v1", () => {
    expect(
      resolveProviderEndpoint(
        "http://localhost:8000/v1",
        "https://api.openai.com/v1/chat/completions",
        "v1/chat/completions",
      ),
    ).toBe("http://localhost:8000/v1/chat/completions");

    expect(
      resolveProviderEndpoint(
        "http://localhost:8000/v1/",
        "https://api.openai.com/v1/models",
        "v1/models",
      ),
    ).toBe("http://localhost:8000/v1/models");
  });

  it("handles custom baseUrl for Anthropic and OpenRouter endpoints", () => {
    expect(
      resolveProviderEndpoint(
        "https://custom-gateway.corp.com/anthropic",
        "https://api.anthropic.com/v1/messages",
        "v1/messages",
      ),
    ).toBe("https://custom-gateway.corp.com/anthropic/v1/messages");

    expect(
      resolveProviderEndpoint(
        "https://openrouter.ai/api",
        "https://openrouter.ai/api/v1/chat/completions",
        "v1/chat/completions",
      ),
    ).toBe("https://openrouter.ai/api/v1/chat/completions");

    expect(
      resolveProviderEndpoint(
        "https://openrouter.ai/api/v1",
        "https://openrouter.ai/api/v1/chat/completions",
        "v1/chat/completions",
      ),
    ).toBe("https://openrouter.ai/api/v1/chat/completions");
  });

  it("preserves and correctly merges query parameters in custom baseUrl", () => {
    expect(
      resolveProviderEndpoint(
        "http://myproxy.local:8000/v1?token=abc&tenant=xyz",
        "https://api.openai.com/v1/chat/completions",
        "v1/chat/completions",
      ),
    ).toBe("http://myproxy.local:8000/v1/chat/completions?token=abc&tenant=xyz");

    expect(
      resolveProviderEndpoint(
        "http://myproxy.local:8000?token=abc",
        "https://api.anthropic.com/v1/models?limit=100",
        "v1/models?limit=100",
      ),
    ).toBe("http://myproxy.local:8000/v1/models?token=abc&limit=100");
  });

  it("handles schemeless baseUrl with query parameters without dropping query params", () => {
    expect(
      resolveProviderEndpoint(
        "localhost:8000?token=abc",
        "https://api.openai.com/v1/chat/completions",
        "v1/chat/completions",
      ),
    ).toBe("http://localhost:8000/v1/chat/completions?token=abc");

    expect(
      resolveProviderEndpoint(
        "myproxy.local:8000/v1?token=abc",
        "https://api.openai.com/v1/chat/completions",
        "v1/chat/completions",
      ),
    ).toBe("http://myproxy.local:8000/v1/chat/completions?token=abc");
  });
});
