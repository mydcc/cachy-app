/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, it, expect } from "vitest";
import { parseStreamChunk, appendToolCallFragment } from "./streamAdapters";

const EMPTY = { text: "", toolCallFragment: null };

describe("parseStreamChunk", () => {
  it("returns a frozen empty delta that callers cannot corrupt", () => {
    const first = parseStreamChunk("openai-chat", null);
    expect(first).toEqual(EMPTY);
    expect(Object.isFrozen(first)).toBe(true);
    // A caller mutating its copy must not affect the next empty delta.
    expect(parseStreamChunk("openai-chat", null)).toEqual(EMPTY);
  });

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

    it("joins text from content-part arrays", () => {
      expect(
        parseStreamChunk("openai-chat", {
          choices: [
            {
              delta: {
                content: [
                  { type: "text", text: "he" },
                  { type: "text", text: "llo" },
                ],
              },
            },
          ],
        }),
      ).toEqual({ text: "hello", toolCallFragment: null });
    });

    it("skips non-text parts in content-part arrays", () => {
      expect(
        parseStreamChunk("openai-chat", {
          choices: [
            {
              delta: {
                content: [
                  { type: "image_url", image_url: "https://x/y.png" },
                  { type: "text", text: "hi" },
                ],
              },
            },
          ],
        }),
      ).toEqual({ text: "hi", toolCallFragment: null });
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

  describe("appendToolCallFragment", () => {
    it("concatenates delta fragments for delta-based flavors", () => {
      const buffer = appendToolCallFragment("openai-chat", "", '{"a"');
      expect(appendToolCallFragment("openai-chat", buffer, ': 1}')).toBe('{"a": 1}');
      expect(appendToolCallFragment("openai-responses", '{"x"', '{"x"')).toBe('{"x"{"x"');
      expect(appendToolCallFragment("anthropic-messages", '{"y"', ': 2}')).toBe('{"y": 2}');
    });

    it("keeps the latest snapshot for google-generate so the buffer stays parseable", () => {
      const first = JSON.stringify({ actions: [{ action: "setLeverage", value: 5 }] });
      const second = JSON.stringify({ actions: [{ action: "setLeverage", value: 10 }] });
      const buffer = appendToolCallFragment("google-generate", "", first);
      const merged = appendToolCallFragment("google-generate", buffer, second);
      expect(merged).toBe(second);
      expect(() => JSON.parse(merged)).not.toThrow();
    });

    it("ignores null fragments", () => {
      expect(appendToolCallFragment("openai-chat", '{"a"', null)).toBe('{"a"');
    });
  });
});

describe("stream usage", () => {
  it("reads OpenAI chat usage from the final, choices-empty chunk", () => {
    expect(
      parseStreamChunk("openai-chat", {
        choices: [],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    ).toEqual({
      text: "",
      toolCallFragment: null,
      usage: { inputTokens: 10, outputTokens: 5 },
    });
  });

  it("reads usage alongside a chat delta", () => {
    expect(
      parseStreamChunk("openai-chat", {
        choices: [{ delta: { content: "x" } }],
        usage: { prompt_tokens: 1 },
      }),
    ).toEqual({
      text: "x",
      toolCallFragment: null,
      usage: { inputTokens: 1 },
    });
  });

  it("reads Responses usage from the completed event", () => {
    expect(
      parseStreamChunk("openai-responses", {
        type: "response.completed",
        response: { usage: { input_tokens: 3, output_tokens: 4 } },
      }),
    ).toEqual({
      text: "",
      toolCallFragment: null,
      usage: { inputTokens: 3, outputTokens: 4 },
    });
  });

  it("reads Anthropic usage from message_start and message_delta", () => {
    expect(
      parseStreamChunk("anthropic-messages", {
        type: "message_start",
        message: { usage: { input_tokens: 7 } },
      }),
    ).toEqual({
      text: "",
      toolCallFragment: null,
      usage: { inputTokens: 7 },
    });
    expect(
      parseStreamChunk("anthropic-messages", {
        type: "message_delta",
        usage: { output_tokens: 9 },
      }),
    ).toEqual({
      text: "",
      toolCallFragment: null,
      usage: { outputTokens: 9 },
    });
  });

  it("reads Google usageMetadata alongside the text part", () => {
    expect(
      parseStreamChunk("google-generate", {
        candidates: [{ content: { parts: [{ text: "x" }] } }],
        usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 3 },
      }),
    ).toEqual({
      text: "x",
      toolCallFragment: null,
      usage: { inputTokens: 2, outputTokens: 3 },
    });
  });
});
