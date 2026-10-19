/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, it, expect } from "vitest";
import { isOpenCodeTarget, resolveProviderEndpoint } from "./aiEndpoint";

describe("isOpenCodeTarget", () => {
  it("matches OpenCode's gateway, its subdomains and a trailing dot", () => {
    expect(
      isOpenCodeTarget("https://opencode.ai/inference/go/v1/chat/completions"),
    ).toBe(true);
    expect(isOpenCodeTarget("https://api.opencode.ai/v1")).toBe(true);
    expect(isOpenCodeTarget("https://OPENCODE.AI/v1")).toBe(true);
    expect(isOpenCodeTarget("https://opencode.ai./v1")).toBe(true);
  });

  it("rejects lookalike hosts and unparseable targets", () => {
    // The leading dot is what keeps a conversation id off these hosts.
    expect(isOpenCodeTarget("https://evil-opencode.ai/v1")).toBe(false);
    expect(isOpenCodeTarget("https://opencode.ai.attacker.com/v1")).toBe(false);
    expect(isOpenCodeTarget("not a url")).toBe(false);
  });
});

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

  it("keeps the base version when it differs from the flavor path (no /v2/v1/ doubling)", () => {
    expect(
      resolveProviderEndpoint(
        "https://opencode.ai/zen/go/v2",
        "https://api.openai.com/v1/chat/completions",
        "v1/models",
      ),
    ).toBe("https://opencode.ai/zen/go/v2/models");

    expect(
      resolveProviderEndpoint(
        "https://gw.example.com/v2",
        "https://api.openai.com/v1/chat/completions",
        "v1/chat/completions",
      ),
    ).toBe("https://gw.example.com/v2/chat/completions");

    expect(
      resolveProviderEndpoint(
        "https://gw.example.com/v10",
        "https://api.openai.com/v1/chat/completions",
        "v1/models",
      ),
    ).toBe("https://gw.example.com/v10/models");
  });

  it("strips only within the same version family (v1beta never collapses onto vN)", () => {
    expect(
      resolveProviderEndpoint(
        "https://gw.example.com/v1beta",
        "https://generativelanguage.googleapis.com/v1beta/models",
        "v1beta/models",
      ),
    ).toBe("https://gw.example.com/v1beta/models");

    expect(
      resolveProviderEndpoint(
        "https://gw.example.com/v1",
        "https://api.openai.com/v1/chat/completions",
        "v1beta/models",
      ),
    ).toBe("https://gw.example.com/v1/v1beta/models");

    expect(
      resolveProviderEndpoint(
        "https://gw.example.com/v1beta",
        "https://api.openai.com/v1/chat/completions",
        "v1/chat/completions",
      ),
    ).toBe("https://gw.example.com/v1beta/v1/chat/completions");
  });

  it("merges base and flavor query params when stripping on the parse path", () => {
    expect(
      resolveProviderEndpoint(
        "https://gw.example.com/v1beta?token=xyz",
        "https://generativelanguage.googleapis.com/v1beta/models/x:streamGenerateContent?alt=sse",
        "v1beta/models/kimi:streamGenerateContent?alt=sse",
      ),
    ).toBe("https://gw.example.com/v1beta/models/kimi:streamGenerateContent?token=xyz&alt=sse");
  });

  it("merges the flavor query param when stripping a v1beta base", () => {
    expect(
      resolveProviderEndpoint(
        "https://gw.example.com/v1beta",
        "https://generativelanguage.googleapis.com/v1beta/models/x:streamGenerateContent?alt=sse",
        "v1beta/models/kimi:streamGenerateContent?alt=sse",
      ),
    ).toBe("https://gw.example.com/v1beta/models/kimi:streamGenerateContent?alt=sse");
  });

  it("applies the version rule on the unparseable-URL fallback path", () => {
    expect(
      resolveProviderEndpoint(
        "http://exa mple.com:abc/v2",
        "https://api.openai.com/v1/chat/completions",
        "v1/models",
      ),
    ).toBe("http://exa mple.com:abc/v2/models");
  });

  it("merges base and flavor query params when stripping on the fallback path", () => {
    expect(
      resolveProviderEndpoint(
        "http://exa mple.com:abc/v2?token=xyz",
        "https://api.openai.com/v1/chat/completions",
        "v1/models",
      ),
    ).toBe("http://exa mple.com:abc/v2/models?token=xyz");
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
