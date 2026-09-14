/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, it, expect } from "vitest";
import { buildDirectModelsRequest, buildDirectRequest, resolveDirectUrl } from "./directRequest";

const messages = [
  { role: "system", content: "SYS" },
  { role: "user", content: "hi" },
];

describe("resolveDirectUrl", () => {
  it("does not double a /v1 the base URL already carries", () => {
    expect(resolveDirectUrl("https://opencode.ai/zen/v1", "v1/chat/completions")).toBe(
      "https://opencode.ai/zen/v1/chat/completions",
    );
  });

  it("does not double a /api/v1 base", () => {
    expect(resolveDirectUrl("https://gw.example.com/api/v1", "api/v1/models")).toBe(
      "https://gw.example.com/api/v1/models",
    );
  });

  it("appends the path when the base has no version segment", () => {
    expect(resolveDirectUrl("https://gw.example.com", "v1/chat/completions")).toBe(
      "https://gw.example.com/v1/chat/completions",
    );
  });

  it("trims trailing slashes", () => {
    expect(resolveDirectUrl("https://gw.example.com/", "v1/responses")).toBe(
      "https://gw.example.com/v1/responses",
    );
  });

  it("rejects a base URL without a scheme", () => {
    expect(() => resolveDirectUrl("gw.example.com", "v1/responses")).toThrow(
      /must start with https:\/\//,
    );
  });

  it("rejects a cleartext http:// base URL", () => {
    expect(() =>
      resolveDirectUrl("http://gw.example.com", "v1/chat/completions"),
    ).toThrow(/Insecure base URL/);
  });

  it("allows cleartext http:// for loopback gateways", () => {
    expect(resolveDirectUrl("http://localhost:11434", "v1/chat/completions")).toBe(
      "http://localhost:11434/v1/chat/completions",
    );
    expect(resolveDirectUrl("http://127.0.0.1:8000/v1", "v1/models")).toBe(
      "http://127.0.0.1:8000/v1/models",
    );
  });

  it("does not double a /v1beta base", () => {
    expect(
      resolveDirectUrl(
        "https://generativelanguage.googleapis.com/v1beta",
        "v1beta/models/x:streamGenerateContent?alt=sse",
      ),
    ).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/x:streamGenerateContent?alt=sse",
    );
  });
});

describe("buildDirectRequest", () => {
  it("builds a chat-completions request with bearer auth", () => {
    const request = buildDirectRequest("openai-chat", {
      baseUrl: "https://opencode.ai/zen/v1",
      apiKey: "sk-test",
      model: "deepseek-v4-flash-free",
      messages,
    });

    expect(request.url).toBe("https://opencode.ai/zen/v1/chat/completions");
    expect(request.headers.Authorization).toBe("Bearer sk-test");
    expect(JSON.parse(request.body)).toMatchObject({
      model: "deepseek-v4-flash-free",
      messages,
      max_tokens: 2000,
      stream: true,
    });
  });

  it("splits the system prompt into instructions for the responses flavor", () => {
    const request = buildDirectRequest("openai-responses", {
      baseUrl: "https://opencode.ai/zen/v1",
      apiKey: "sk-test",
      model: "gpt-5.6",
      messages,
    });

    expect(request.url).toBe("https://opencode.ai/zen/v1/responses");
    const body = JSON.parse(request.body);
    expect(body.instructions).toBe("SYS");
    expect(body.input).toEqual([{ role: "user", content: "hi" }]);
    expect(body.max_output_tokens).toBe(2000);
  });

  it("builds an Anthropic messages request with cached system blocks", () => {
    const request = buildDirectRequest("anthropic-messages", {
      baseUrl: "https://opencode.ai/zen/v1",
      apiKey: "sk-ant",
      model: "claude-sonnet-5",
      messages: [
        {
          role: "system",
          content: JSON.stringify({ staticInstruction: "S", dynamicContext: "D" }),
        },
        { role: "user", content: "hi" },
      ],
    });

    expect(request.url).toBe("https://opencode.ai/zen/v1/messages");
    expect(request.headers["x-api-key"]).toBe("sk-ant");
    expect(request.headers["anthropic-version"]).toBe("2023-06-01");
    const body = JSON.parse(request.body);
    expect(body.system).toEqual([
      { type: "text", text: "S", cache_control: { type: "ephemeral" } },
      { type: "text", text: "\n\nD" },
    ]);
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("omits the Anthropic system field when there is no system prompt", () => {
    const request = buildDirectRequest("anthropic-messages", {
      baseUrl: "https://opencode.ai/zen/v1",
      apiKey: "sk-ant",
      model: "claude-sonnet-5",
      messages: [{ role: "user", content: "hi" }],
    });
    const body = JSON.parse(request.body);
    expect(body.system).toBeUndefined();
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("builds a Google generateContent request with the key header", () => {
    const request = buildDirectRequest("google-generate", {
      baseUrl: "https://generativelanguage.googleapis.com",
      apiKey: "g-key",
      model: "gemini-1.5-flash",
      messages,
    });

    expect(request.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse",
    );
    expect(request.headers["x-goog-api-key"]).toBe("g-key");
    const body = JSON.parse(request.body);
    expect(body.contents).toEqual([{ role: "user", parts: [{ text: "hi" }] }]);
    expect(body.systemInstruction).toEqual({ parts: [{ text: "SYS" }] });
  });
});

describe("buildDirectModelsRequest", () => {
  it("builds the openai models URL without doubling /v1", () => {
    const request = buildDirectModelsRequest("openai-chat", {
      baseUrl: "https://opencode.ai/zen/go/v1",
      apiKey: "k",
    });
    expect(request.url).toBe("https://opencode.ai/zen/go/v1/models");
    expect(request.headers.Authorization).toBe("Bearer k");
  });

  it("sends the anthropic version header and key header", () => {
    const request = buildDirectModelsRequest("anthropic-messages", {
      baseUrl: "https://api.anthropic.com",
      apiKey: "sk",
    });
    expect(request.url).toBe("https://api.anthropic.com/v1/models");
    expect(request.headers["anthropic-version"]).toBe("2023-06-01");
    expect(request.headers["x-api-key"]).toBe("sk");
  });

  it("targets v1beta/models for google with the goog key header", () => {
    const request = buildDirectModelsRequest("google-generate", {
      baseUrl: "https://generativelanguage.googleapis.com",
      apiKey: "AIza",
    });
    expect(request.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models",
    );
    expect(request.headers["x-goog-api-key"]).toBe("AIza");
  });
});
