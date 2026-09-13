/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, it, expect } from "vitest";
import { parseStreamChunk } from "./streamAdapters";

const EMPTY = { text: "", toolCallFragment: null };

describe("parseStreamChunk", () => {
  it("returns the empty delta for non-object payloads", () => {
    expect(parseStreamChunk("openai-chat", null)).toEqual(EMPTY);
    expect(parseStreamChunk("openai-chat", "ping")).toEqual(EMPTY);
    expect(parseStreamChunk("openai-chat", 42)).toEqual(EMPTY);
  });

  describe("openai-chat", () => {
    it("reads the assistant text delta", () => {
      expect(
        parseStreamChunk("openai-chat", { choices: [{ delta: { content: "hi" } }] }),
      ).toEqual({ text: "hi", toolCallFragment: null });
    });

    it("reads a tool-call argument fragment", () => {
      expect(
        parseStreamChunk("openai-chat", {
          choices: [{ delta: { tool_calls: [{ function: { arguments: '{"a"' } }] } }],
        }),
      ).toEqual({ text: "", toolCallFragment: '{"a"' });
    });

    it("ignores a role-only first chunk", () => {
      expect(
        parseStreamChunk("openai-chat", { choices: [{ delta: { role: "assistant" } }] }),
      ).toEqual(EMPTY);
    });
  });

  describe("openai-responses", () => {
    it("reads output text deltas", () => {
      expect(
        parseStreamChunk("openai-responses", { type: "response.output_text.delta", delta: "yo" }),
      ).toEqual({ text: "yo", toolCallFragment: null });
    });

    it("reads function-call argument deltas", () => {
      expect(
        parseStreamChunk("openai-responses", {
          type: "response.function_call_arguments.delta",
          delta: '{"x"',
        }),
      ).toEqual({ text: "", toolCallFragment: '{"x"' });
    });

    it("ignores unrelated events such as completion markers", () => {
      expect(
        parseStreamChunk("openai-responses", { type: "response.completed" }),
      ).toEqual(EMPTY);
    });
  });

  describe("anthropic-messages", () => {
    it("reads text deltas", () => {
      expect(
        parseStreamChunk("anthropic-messages", {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "hey" },
        }),
      ).toEqual({ text: "hey", toolCallFragment: null });
    });

    it("reads input JSON deltas", () => {
      expect(
        parseStreamChunk("anthropic-messages", {
          type: "content_block_delta",
          delta: { type: "input_json_delta", partial_json: '{"y"' },
        }),
      ).toEqual({ text: "", toolCallFragment: '{"y"' });
    });

    it("ignores non-text block deltas", () => {
      expect(
        parseStreamChunk("anthropic-messages", {
          type: "content_block_delta",
          delta: { type: "thinking_delta", thinking: "x" },
        }),
      ).toEqual(EMPTY);
    });
  });

  describe("google-generate", () => {
    it("reads a text part", () => {
      expect(
        parseStreamChunk("google-generate", {
          candidates: [{ content: { parts: [{ text: "oi" }] } }],
        }),
      ).toEqual({ text: "oi", toolCallFragment: null });
    });

    it("serializes a function call whose args carry actions", () => {
      const args = { actions: [{ action: "setLeverage", value: 5 }] };
      expect(
        parseStreamChunk("google-generate", {
          candidates: [{ content: { parts: [{ functionCall: { args } }] } }],
        }),
      ).toEqual({ text: "", toolCallFragment: JSON.stringify(args) });
    });

    it("ignores a function call without actions", () => {
      expect(
        parseStreamChunk("google-generate", {
          candidates: [{ content: { parts: [{ functionCall: { args: { other: 1 } } }] } }],
        }),
      ).toEqual(EMPTY);
    });
  });
});
